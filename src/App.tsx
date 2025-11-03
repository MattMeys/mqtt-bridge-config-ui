import { useState, useEffect } from "react";
import { BridgesConfig, defaultBridge } from "./types/mqtt-bridge";
import { BridgeForm } from "./components/BridgeForm";
import { Button } from "./components/ui/button";
import { Plus, Download, Upload, FileJson } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "./components/ui/alert";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner@2.0.3";
import { Toaster } from "./components/ui/sonner";
import logo from "figma:asset/0edd3e9239d6ff6f8f9c5985d785e309773e3d03.png";

import sampleConfig from "./assets/mqtt-bridges-config_sample.json"; 

export default function App() {
  const [config, setConfig] = useState<BridgesConfig>({
    bridges: [{ ...defaultBridge }],
  });

  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [hasAttemptedValidation, setHasAttemptedValidation] = useState(false);

  // load sample config from server assets on first render
  useEffect(() => {
    const loadSample = async () => {
      try {
        const imported = sampleConfig;
        if (imported && imported.bridges && Array.isArray(imported.bridges) && imported.bridges.length > 0) {
          setConfig(imported as BridgesConfig);
          setValidationErrors([]);
          setHasAttemptedValidation(false);
          toast.success("Sample configuration loaded from assets");
        }
      } catch {
        toast.error("Failed to load sample configuration from assets");
      }
    };

    loadSample();
  }, []);

  const addBridge = () => {
    setConfig({
      bridges: [...config.bridges, { ...defaultBridge }],
    });
  };

  const removeBridge = (index: number) => {
    setConfig({
      bridges: config.bridges.filter((_, i) => i !== index),
    });
  };

  const updateBridge = (index: number, bridge: any) => {
    const newBridges = [...config.bridges];
    newBridges[index] = bridge;
    setConfig({ bridges: newBridges });
  };

  const validateConfig = (): boolean => {
    const errors: string[] = [];

    if (config.bridges.length === 0) {
      errors.push("At least one bridge is required");
    }

    config.bridges.forEach((bridge, bridgeIndex) => {
      if (!bridge.name || bridge.name.trim() === "") {
        errors.push(`Bridge ${bridgeIndex + 1}: Name is required`);
      }

      if (bridge.brokers.length < 2) {
        errors.push(`Bridge ${bridgeIndex + 1}: At least 2 brokers are required`);
      }

      bridge.brokers.forEach((broker, brokerIndex) => {
        const brokerLabel = `Bridge ${bridgeIndex + 1}, Broker ${brokerIndex + 1}`;
        
        if (!broker.network.instance_name || broker.network.instance_name.trim() === "") {
          errors.push(`${brokerLabel}: Instance name is required`);
        }

        // Validate protocol-specific address fields
        switch (broker.network.protocol) {
          case "in":
            if (!broker.network.in?.host) {
              errors.push(`${brokerLabel}: IPv4 host is required`);
            }
            if (!broker.network.in?.port || broker.network.in.port < 1 || broker.network.in.port > 65535) {
              errors.push(`${brokerLabel}: Valid IPv4 port (1-65535) is required`);
            }
            break;
          case "in6":
            if (!broker.network.in6?.host) {
              errors.push(`${brokerLabel}: IPv6 host is required`);
            }
            if (!broker.network.in6?.port || broker.network.in6.port < 1 || broker.network.in6.port > 65535) {
              errors.push(`${brokerLabel}: Valid IPv6 port (1-65535) is required`);
            }
            break;
          case "rc":
            if (!broker.network.rc?.host) {
              errors.push(`${brokerLabel}: Bluetooth address is required`);
            }
            if (!broker.network.rc?.channel || broker.network.rc.channel < 1 || broker.network.rc.channel > 30) {
              errors.push(`${brokerLabel}: Valid RFCOMM channel (1-30) is required`);
            }
            break;
          case "l2":
            if (!broker.network.l2?.host) {
              errors.push(`${brokerLabel}: Bluetooth address is required`);
            }
            if (!broker.network.l2?.psm || broker.network.l2.psm < 1 || broker.network.l2.psm > 65535) {
              errors.push(`${brokerLabel}: Valid L2CAP PSM (1-65535) is required`);
            }
            break;
          case "un":
            if (!broker.network.un?.path) {
              errors.push(`${brokerLabel}: Unix socket path is required`);
            }
            break;
        }
      });
    });

    setValidationErrors(errors);
    setHasAttemptedValidation(true);
    return errors.length === 0;
  };


  // build cleaned config to use in export/view/save
  const buildCleanConfig = () => {
    return {
      bridges: config.bridges.map(bridge => {
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
              topics: broker.topics,
            };

            if (broker.disabled) {
              cleanBroker.disabled = broker.disabled;
            }

            if (broker.session_store) {
              cleanBroker.session_store = broker.session_store;
            }

            if (broker.prefix) {
              cleanBroker.prefix = broker.prefix;
            }

            if (broker.mqtt) {
              cleanBroker.mqtt = broker.mqtt;
            }

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

        if (bridge.disabled) {
          cleanBridge.disabled = bridge.disabled;
        }

        if (bridge.prefix) {
          cleanBridge.prefix = bridge.prefix;
        }

        return cleanBridge;
      }),
    };
  };


  const exportConfig = () => {
    if (!validateConfig()) {
      toast.error("Configuration has validation errors", {
        description: "Please fix the errors before exporting",
      });
      return;
    }

    // Clean up the config to match the JSON schema
    const cleanConfig = buildCleanConfig();

    const jsonString = JSON.stringify(cleanConfig, null, 2);
    const blob = new Blob([jsonString], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "mqtt-bridges-config.json";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    toast.success("Configuration exported successfully", {
      description: "mqtt-bridges-config.json has been downloaded",
    });
  };

  const importConfig = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json";
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
          try {
            const imported = JSON.parse(e.target?.result as string);
            setConfig(imported);
            setValidationErrors([]);
            setHasAttemptedValidation(false);
            toast.success("Configuration imported successfully");
          } catch (error) {
            toast.error("Failed to import configuration", {
              description: "Invalid JSON file",
            });
          }
        };
        reader.readAsText(file);
      }
    };
    input.click();
  };

  const viewJSON = () => {
    if (!validateConfig()) {
      toast.error("Configuration has validation errors");
      return;
    }

    const cleanConfig = buildCleanConfig();

    const jsonString = JSON.stringify(cleanConfig, null, 2);
    const newWindow = window.open("", "_blank");
    if (newWindow) {
      newWindow.document.write(`
        <html>
          <head>
            <title>MQTT Bridge Configuration</title>
            <style>
              body {
                font-family: monospace;
                padding: 20px;
                background: #1e1e1e;
                color: #d4d4d4;
              }
              pre {
                background: #1e1e1e;
                padding: 20px;
                border-radius: 8px;
                overflow: auto;
              }
            </style>
          </head>
          <body>
            <h1>MQTT Bridge Configuration</h1>
            <pre>${jsonString}</pre>
          </body>
        </html>
      `);
      newWindow.document.close();
    }
  };

  
  
  
  // Save to assets: attempts to save directly (File System Access API) or falls back to download.
  const saveConfigToAssets = async () => {
    if (!validateConfig()) {
      toast.error("Configuration has validation errors", {
        description: "Please fix errors before saving",
      });
      return;
    }

    const cleanConfig = buildCleanConfig();
    const jsonString = JSON.stringify(cleanConfig, null, 2);
    
    // Try saving to the server assets folder via API
    try {
      const res = await fetch("/api/save-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: jsonString,
      });
      if (res.ok) {
        toast.success("Configuration saved to server assets/mqtt-bridges-config.json");
        return;
      } else {
        const text = await res.text().catch(() => res.statusText || "server error");
        toast.error("Server save failed", { description: text });
        // continue to fallbacks
      }
    } catch (err) {
      // fetch failed - server likely not running; fall back to client options below
    }
  }



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
            <div className="flex gap-3">
              <Button onClick={importConfig} variant="outline">
                <Upload className="h-4 w-4 mr-2" />
                Import
              </Button>
              <Button onClick={viewJSON} variant="outline">
                <FileJson className="h-4 w-4 mr-2" />
                View JSON
              </Button>
              <Button onClick={exportConfig}>
                <Download className="h-4 w-4 mr-2" />
                Export Config
              </Button>
              <Button onClick={saveConfigToAssets} variant="outline">
                <Download className="h-4 w-4 mr-2" />
                Save (assets)
              </Button>
            </div>
          </div>
        </div>
      </div>



      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        {hasAttemptedValidation && validationErrors.length > 0 && (
          <Alert variant="destructive" className="mb-6">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Validation Errors</AlertTitle>
            <AlertDescription>
              <ul className="list-disc list-inside mt-2 space-y-1">
                {validationErrors.map((error, index) => (
                  <li key={index}>{error}</li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        )}

        {hasAttemptedValidation && validationErrors.length === 0 && config.bridges.length > 0 && (
          <Alert className="mb-6 border-green-500/50 bg-green-500/10">
            <CheckCircle2 className="h-4 w-4 text-green-500" />
            <AlertTitle className="text-green-500">Configuration Valid</AlertTitle>
            <AlertDescription className="text-green-500/80">
              All required fields are filled and constraints are met
            </AlertDescription>
          </Alert>
        )}

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
          </div>
        </div>
      </div>
    </div>
  );
}