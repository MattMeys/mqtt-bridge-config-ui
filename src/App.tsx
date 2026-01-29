import { useState, useEffect, useRef } from "react";
import { BridgesConfig, defaultBridge } from "./types/mqtt-bridge";
import { BridgeForm } from "./components/BridgeForm";
import { Button } from "./components/ui/button";
import { Plus, AlertCircle, CheckCircle2, Circle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "./components/ui/alert";
import { toast } from "sonner@2.0.3";
import { Toaster } from "./components/ui/sonner";
import logo from "figma:asset/0edd3e9239d6ff6f8f9c5985d785e309773e3d03.png";

interface BridgeStatus {
  state: "running" | "stopped" | "restarting";
  since: string;
}

// Format elapsed time from ISO string
function formatElapsedTime(sinceISO: string): string {
  const since = new Date(sinceISO);
  const now = new Date();
  const seconds = Math.floor((now.getTime() - since.getTime()) / 1000);
  
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}

// Status indicator component
function StatusIndicator({ status }: { status: BridgeStatus }) {
  const [elapsedTime, setElapsedTime] = useState(formatElapsedTime(status.since));

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsedTime(formatElapsedTime(status.since));
    }, 1000);
    return () => clearInterval(interval);
  }, [status.since]);

  const getStatusColor = () => {
    switch (status.state) {
      case "running":
        return "bg-green-500";
      case "restarting":
        return "bg-yellow-500";
      case "stopped":
        return "bg-red-500";
      default:
        return "bg-gray-500";
    }
  };

  const getStatusText = () => {
    switch (status.state) {
      case "running":
        return `Running for ${elapsedTime}`;
      case "restarting":
        return `Restarting for ${elapsedTime}`;
      case "stopped":
        return `Stopped for ${elapsedTime}`;
      default:
        return "Unknown";
    }
  };

  return (
    <div className="flex items-center gap-2">
      <Circle className={`h-3 w-3 fill-current ${getStatusColor()}`} />
      <span className="text-sm font-medium">{getStatusText()}</span>
    </div>
  );
}

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
  const [bridgeStatus, setBridgeStatus] = useState<BridgeStatus | null>(null);
  
  // Keep track of the last saved config for generating patches
  const lastSavedConfigRef = useRef<BridgesConfig | null>(null);
  // Keep a synchronous reference to the latest in-memory config so
  // immediate saves (e.g. checkbox toggles) can use it before state commits
  const latestConfigRef = useRef<BridgesConfig>(config);
  // Store EventSource for cleanup
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);

  // Load configuration on mount
  useEffect(() => {
    loadConfig();
    connectToSSE();
    
    // Cleanup function
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
    };
  }, []);

  const connectToSSE = () => {
    // Close existing connection if any
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }
    
    // Clear any pending reconnect timeout
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    try {
      const eventSource = new EventSource("/api/bridge/sse");
      eventSourceRef.current = eventSource;

      // Handle connection opened
      eventSource.onopen = () => {
        console.log("SSE connection established");
      };

      // Handle generic messages (for debugging)
      eventSource.onmessage = (event) => {
        console.log("SSE message received:", event.type, event.data);
      };

      // Add a catch-all listener using a custom approach
      const wrappedAddEventListener = eventSource.addEventListener.bind(eventSource);
      let eventNamesLogged = false;
      
      // Intercept dispatchEvent to log all events
      const originalDispatchEvent = eventSource.dispatchEvent.bind(eventSource);
      (eventSource as any).dispatchEvent = function(event: Event) {
        if (!eventNamesLogged || Math.random() < 0.1) {
          // Log first 10 events to see all event types
          console.log("SSE Event dispatched:", (event as any).type, (event as any).data);
        }
        return originalDispatchEvent(event);
      };

      // Handle bridge_started event
      eventSource.addEventListener("bridge_started", (event) => {
        console.log("bridge_started event received:", event.data);
        try {
          const data = JSON.parse(event.data);
          setBridgeStatus({
            state: "running",
            since: data.at,
          });
          toast.success("Bridge started", {
            description: `Started at ${new Date(data.at).toLocaleString()}`,
          });
        } catch (error) {
          console.error("Failed to parse bridge_started event:", error);
        }
      });

      // Handle bridge_stopped event
      eventSource.addEventListener("bridge_stopped", (event) => {
        console.log("bridge_stopped event received:", event.data);
        try {
          const data = JSON.parse(event.data);
          setBridgeStatus({
            state: "stopped",
            since: data.at,
          });
          toast.info("Bridge stopped", {
            description: `Stopped at ${new Date(data.at).toLocaleString()}`,
          });
        } catch (error) {
          console.error("Failed to parse bridge_stopped event:", error);
        }
      });

      // Handle broker_connected event
      eventSource.addEventListener("broker_connected", (event) => {
        console.log("broker_connected event received:", event.data);
        try {
          const data = JSON.parse(event.data);
          toast.success("Broker connected", {
            description: `${data.instance} connected at ${new Date(data.at).toLocaleString()}`,
          });
        } catch (error) {
          console.error("Failed to parse broker_connected event:", error);
        }
      });

      // Handle broker_disconnected event
      eventSource.addEventListener("broker_disconnected", (event) => {
        console.log("broker_disconnected event received:", event.data);
        try {
          const data = JSON.parse(event.data);
          toast.warning("Broker disconnected", {
            description: `${data.instance} disconnected at ${new Date(data.at).toLocaleString()}`,
          });
        } catch (error) {
          console.error("Failed to parse broker_disconnected event:", error);
        }
      });

      eventSource.onerror = (error) => {
        console.error("SSE connection error:", error);
        
        // Close the failed connection
        if (eventSourceRef.current) {
          eventSourceRef.current.close();
          eventSourceRef.current = null;
        }
        
        // Attempt to reconnect after 5 seconds
        console.log("Attempting to reconnect in 5 seconds...");
        reconnectTimeoutRef.current = window.setTimeout(() => {
          connectToSSE();
        }, 5000);
      };
    } catch (error) {
      console.error("Failed to create SSE connection:", error);
      // Retry after 5 seconds
      reconnectTimeoutRef.current = window.setTimeout(() => {
        connectToSSE();
      }, 5000);
    }
  };

  const loadConfig = async () => {
    try {
      setIsLoading(true);
      const response = await fetch('/api/bridge/config');
      
      if (!response.ok) {
        throw new Error(`Failed to load configuration: ${response.statusText}`);
      }
      
      const data = await response.json();
      if (data === null || typeof data !== 'object' || !Array.isArray(data.bridges)) {
        throw new Error("Invalid configuration format received from server");
      }
      setConfig(data);
      lastSavedConfigRef.current = JSON.parse(JSON.stringify(data)); // Deep clone
      // Keep latest reference in sync immediately
      latestConfigRef.current = data;
      toast.success("Configuration loaded successfully");
    } catch (error) {
      toast.error("Failed to load configuration", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
      // Keep the default config if loading fails
      lastSavedConfigRef.current = JSON.parse(JSON.stringify(config));
      latestConfigRef.current = config;
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
      
      // toast.success("Configuration saved", {
      //   description: `${patch.length} change${patch.length !== 1 ? 's' : ''} applied`,
      // });
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
    // Update latest ref synchronously so immediate saves use correct data
    latestConfigRef.current = newConfig;
    sendPatchToServer(newConfig);
  };

  const removeBridge = (index: number) => {
    const newConfig = {
      bridges: config.bridges.filter((_, i) => i !== index),
    };
    setConfig(newConfig);
    // Update latest ref synchronously
    latestConfigRef.current = newConfig;
    sendPatchToServer(newConfig);
  };

  const duplicateBridge = (index: number) => {
    const bridgeToDuplicate = config.bridges[index];
    const duplicatedBridge = JSON.parse(JSON.stringify(bridgeToDuplicate));
    // Optional: update name to indicate it's a duplicate
    duplicatedBridge.name = `${bridgeToDuplicate.name}-copy`;
    const newConfig = {
      bridges: [...config.bridges, duplicatedBridge],
    };
    setConfig(newConfig);
    // Update latest ref synchronously
    latestConfigRef.current = newConfig;
    sendPatchToServer(newConfig);
  };

  const updateBridge = (index: number, bridge: any) => {
    const newBridges = [...config.bridges];
    newBridges[index] = bridge;
    const newConfig = { bridges: newBridges };
    setConfig(newConfig);
    // Keep latest ref in sync immediately so children can call onSave()
    // and the save will operate on the most recent config.
    latestConfigRef.current = newConfig;
    // Don't send patch immediately - wait for onBlurSave callback
  };

  const handleSaveToServer = () => {
    // Use the synchronous latest config ref so saves triggered immediately
    // after setState see the updated data.
    sendPatchToServer(latestConfigRef.current);
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
            {bridgeStatus && (
              <StatusIndicator status={bridgeStatus} />
            )}
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
                  onDuplicate={() => duplicateBridge(index)}
                />
              ))}
            </div>
          )}

          <Button onClick={addBridge}>
            <Plus className="h-4 w-4 mr-2" />
            Add Bridge
          </Button>
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