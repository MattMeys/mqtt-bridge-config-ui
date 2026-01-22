import { useState, useEffect, useRef } from "react";
import { BridgesConfig, defaultBridge } from "./types/mqtt-bridge";
import { BridgeForm } from "./components/BridgeForm";
import { Button } from "./components/ui/button";
import { Plus, AlertCircle, CheckCircle2 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "./components/ui/alert";
import { toast } from "sonner@2.0.3";
import { Toaster } from "./components/ui/sonner";
import logo from "figma:asset/0edd3e9239d6ff6f8f9c5985d785e309773e3d03.png";

// Precise JSON patch comparison function
function generateJSONPatch(oldObj: any, newObj: any, path = ""): any[] {
  const patches: any[] = [];
  
  // Handle array changes - compare element by element
  if (Array.isArray(oldObj) && Array.isArray(newObj)) {
    // Handle array length changes and element-wise comparison
    const maxLength = Math.max(oldObj.length, newObj.length);
    
    for (let i = 0; i < maxLength; i++) {
      const elementPath = `${path}/${i}`;
      const oldElement = oldObj[i];
      const newElement = newObj[i];
      
      if (i >= newObj.length) {
        // Element was removed
        patches.push({ op: "remove", path: elementPath });
      } else if (i >= oldObj.length) {
        // Element was added
        patches.push({ op: "add", path: elementPath, value: newElement });
      } else if (JSON.stringify(oldElement) !== JSON.stringify(newElement)) {
        // Element changed
        if (typeof oldElement === "object" && typeof newElement === "object" && oldElement !== null && newElement !== null) {
          // Recursively compare array element objects
          const nestedPatches = generateJSONPatch(oldElement, newElement, elementPath);
          patches.push(...nestedPatches);
        } else {
          patches.push({ op: "replace", path: elementPath, value: newElement });
        }
      }
    }
    return patches;
  }
  
  // Handle object changes
  if (typeof oldObj === "object" && typeof newObj === "object" && oldObj !== null && newObj !== null) {
    const allKeys = new Set([...Object.keys(oldObj), ...Object.keys(newObj)]);
    
    for (const key of allKeys) {
      const newPath = path ? `${path}/${key}` : `/${key}`;
      const oldValue = oldObj[key];
      const newValue = newObj[key];
      
      if (!(key in newObj)) {
        // Key was removed
        patches.push({ op: "remove", path: newPath });
      } else if (!(key in oldObj)) {
        // Key was added
        patches.push({ op: "add", path: newPath, value: newValue });
      } else if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
        // Value changed
        if (typeof oldValue === "object" && typeof newValue === "object" && oldValue !== null && newValue !== null) {
          // Recursively compare objects and arrays
          const nestedPatches = generateJSONPatch(oldValue, newValue, newPath);
          patches.push(...nestedPatches);
        } else {
          patches.push({ op: "replace", path: newPath, value: newValue });
        }
      }
    }
  } else if (oldObj !== newObj) {
    // Primitive value changed
    patches.push({ op: "replace", path: path || "/", value: newObj });
  }
  
  return patches;
}

export default function App() {
  const [config, setConfig] = useState<BridgesConfig>({
    bridges: [{ ...defaultBridge }],
  });
  const [isLoading, setIsLoading] = useState(true);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [hasAttemptedValidation, setHasAttemptedValidation] = useState(false);
  
  // Keep track of the last saved config for generating patches
  const lastSavedConfigRef = useRef<BridgesConfig | null>(null);

  // Load configuration on mount
  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      setIsLoading(true);
      const response = await fetch('/api/bridge/config');
      
      if (!response.ok) {
        throw new Error(`Failed to load configuration: ${response.statusText}`);
      }
      
      const data = await response.json();
      setConfig(data);
      lastSavedConfigRef.current = JSON.parse(JSON.stringify(data)); // Deep clone
      toast.success("Configuration loaded successfully");
    } catch (error) {
      toast.error("Failed to load configuration", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
      // Keep the default config if loading fails
    } finally {
      setIsLoading(false);
    }
  };

  const cleanConfig = (cfg: BridgesConfig) => {
    // Clean up the config to match the JSON schema
    // Keep all required fields even if empty to avoid server errors
    return {
      bridges: cfg.bridges.map(bridge => {
        const cleanBridge: any = {
          name: bridge.name,
          brokers: bridge.brokers.map(broker => {
            const cleanBroker: any = {
              network: {
                instance_name: broker.network.instance_name,
                protocol: broker.network.protocol,
                encryption: broker.network.encryption,
                transport: broker.network.transport,
              },
              mqtt: broker.mqtt || {}, // Always include mqtt object, even if empty
              topics: broker.topics,
            };

            // Add disabled if true
            if (broker.disabled) {
              cleanBroker.disabled = broker.disabled;
            }

            // Add session_store only if it's not empty
            if (broker.session_store) {
              cleanBroker.session_store = broker.session_store;
            }

            // Add prefix if it's not empty
            if (broker.prefix) {
              cleanBroker.prefix = broker.prefix;
            }

            // Add the protocol-specific address fields
            switch (broker.network.protocol) {
              case "in":
                if (broker.network.in) cleanBroker.network.in = broker.network.in;
                break;
              case "in6":
                if (broker.network.in6) cleanBroker.network.in6 = broker.network.in6;
                break;
              case "rc":
                if (broker.network.rc) cleanBroker.network.rc = broker.network.rc;
                break;
              case "l2":
                if (broker.network.l2) cleanBroker.network.l2 = broker.network.l2;
                break;
              case "un":
                if (broker.network.un) cleanBroker.network.un = broker.network.un;
                break;
            }

            return cleanBroker;
          }),
        };

        // Add disabled if true
        if (bridge.disabled) {
          cleanBridge.disabled = bridge.disabled;
        }

        // Add prefix if it's not empty
        if (bridge.prefix) {
          cleanBridge.prefix = bridge.prefix;
        }

        return cleanBridge;
      }),
    };
  };

  const sendPatchToServer = async (newConfig: BridgesConfig) => {
    if (!lastSavedConfigRef.current) {
      // If we don't have a reference config yet, skip sending patch
      return;
    }

    const cleanedOld = cleanConfig(lastSavedConfigRef.current);
    const cleanedNew = cleanConfig(newConfig);

    // Generate JSON patch
    const patch = generateJSONPatch(cleanedOld, cleanedNew);

    if (patch.length === 0) {
      // No changes detected
      return;
    }

    try {
      const response = await fetch('/api/bridge/config', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json-patch+json',
        },
        body: JSON.stringify(patch),
      });

      if (!response.ok) {
        throw new Error(`Failed to save configuration: ${response.statusText}`);
      }

      // Update the last saved config
      lastSavedConfigRef.current = JSON.parse(JSON.stringify(newConfig));
      
      toast.success("Configuration saved", {
        description: `${patch.length} change${patch.length !== 1 ? 's' : ''} applied`,
      });
    } catch (error) {
      toast.error("Failed to save configuration", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  const addBridge = () => {
    const newConfig = {
      bridges: [...config.bridges, { ...defaultBridge }],
    };
    setConfig(newConfig);
    sendPatchToServer(newConfig);
  };

  const removeBridge = (index: number) => {
    const newConfig = {
      bridges: config.bridges.filter((_, i) => i !== index),
    };
    setConfig(newConfig);
    sendPatchToServer(newConfig);
  };

  const updateBridge = (index: number, bridge: any) => {
    const newBridges = [...config.bridges];
    newBridges[index] = bridge;
    const newConfig = { bridges: newBridges };
    setConfig(newConfig);
    // Don't send patch immediately - wait for onBlurSave callback
  };

  const handleSaveToServer = () => {
    sendPatchToServer(config);
  };

  return (
    <div className="min-h-screen bg-background">
      <Toaster />
      
      {/* Header */}
      <div className="border-b border-border bg-card">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <img src={logo} alt="Logo" className="h-12 w-12" />
              <div>
                <h1>MQTT Bridge Configuration</h1>
                <p className="text-muted-foreground mt-2">
                  Configure MQTT bridges to connect and synchronize multiple brokers
                </p>
              </div>
            </div>
            {isLoading && (
              <div className="text-sm text-muted-foreground">Loading...</div>
            )}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2>Bridges</h2>
              <p className="text-muted-foreground mt-1">
                {config.bridges.length} bridge{config.bridges.length !== 1 ? "s" : ""} configured
              </p>
            </div>
            <Button onClick={addBridge}>
              <Plus className="h-4 w-4 mr-2" />
              Add Bridge
            </Button>
          </div>

          {config.bridges.length === 0 ? (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>No bridges configured</AlertTitle>
              <AlertDescription>
                Click "Add Bridge" to create your first MQTT bridge configuration
              </AlertDescription>
            </Alert>
          ) : (
            <div className="space-y-6">
              {config.bridges.map((bridge, index) => (
                <BridgeForm
                  key={index}
                  bridge={bridge}
                  index={index}
                  onChange={(updatedBridge) => updateBridge(index, updatedBridge)}
                  onSave={handleSaveToServer}
                  onDelete={() => removeBridge(index)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Info Section */}
        <div className="mt-12 p-6 bg-muted/50 rounded-lg border border-border">
          <h3 className="mb-3">Configuration Guide</h3>
          <div className="space-y-2 text-sm text-muted-foreground">
            <p>• Each bridge connects 2 or more MQTT brokers together</p>
            <p>• Topics use MQTT wildcard patterns: # (multi-level) and + (single-level)</p>
            <p>• QoS levels: 0 (at most once), 1 (at least once), 2 (exactly once)</p>
            <p>• Enable loop prevention to avoid message cycles between brokers</p>
            <p>• Use TLS encryption for secure connections over public networks</p>
            <p>• Changes are automatically saved when you finish editing a field</p>
          </div>
        </div>
      </div>
    </div>
  );
}