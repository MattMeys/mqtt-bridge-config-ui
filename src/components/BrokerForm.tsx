import { Broker, Network, defaultMqtt } from "../types/mqtt-bridge";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Card, CardContent, CardHeader } from "./ui/card";
import { Button } from "./ui/button";
import { Trash2, ChevronDown } from "lucide-react";
import { ConnectionForm } from "./ConnectionForm";
import { TopicsForm } from "./TopicsForm";
import { NetworkAddressForm } from "./NetworkAddressForm";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "./ui/collapsible";
import { Checkbox } from "./ui/checkbox";
import { useState } from "react";

interface BrokerFormProps {
  broker: Broker;
  index: number;
  canDelete: boolean;
  onChange: (broker: Broker) => void;
  onSave: () => void;
  onDelete: () => void;
}

export function BrokerForm({ broker, index, canDelete, onChange, onSave, onDelete }: BrokerFormProps) {
  const [isOpen, setIsOpen] = useState(false);
  
  const updateField = <K extends keyof Broker>(field: K, value: Broker[K]) => {
    onChange({ ...broker, [field]: value });
  };

  const updateNetworkField = <K extends keyof Network>(field: K, value: Network[K]) => {
    const updatedNetwork = { ...broker.network, [field]: value };
    
    // When protocol changes, initialize the appropriate address fields
    if (field === "protocol") {
      // Clear all protocol-specific fields
      delete updatedNetwork.in;
      delete updatedNetwork.in6;
      delete updatedNetwork.rc;
      delete updatedNetwork.l2;
      delete updatedNetwork.un;
      
      // Initialize the new protocol's default values
      switch (value) {
        case "in":
          updatedNetwork.in = { host: "", port: 1883 };
          break;
        case "in6":
          updatedNetwork.in6 = { host: "", port: 1883 };
          break;
        case "rc":
          updatedNetwork.rc = { host: "", channel: 1 };
          break;
        case "l2":
          updatedNetwork.l2 = { host: "", psm: 1 };
          break;
        case "un":
          updatedNetwork.un = { path: "" };
          break;
      }
    }
    
    onChange({ ...broker, network: updatedNetwork });
  };

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card className={broker.disabled ? 'opacity-50' : ''}>
        <CardHeader className="flex flex-row items-center gap-3 space-y-0 pb-3 pt-3">
          <CollapsibleTrigger className="flex items-center gap-2 hover:opacity-70 transition-opacity flex-shrink-0">
            <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            <span className="text-sm text-muted-foreground">Broker {index + 1}</span>
          </CollapsibleTrigger>
          <div className="flex-1">
            <Input
              id={`instance-name-${index}`}
              value={broker.network.instance_name}
              onChange={(e) => updateNetworkField("instance_name", e.target.value)}
              onBlur={onSave}
              placeholder="Instance name (required)"
              required
              className="h-9"
            />
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Checkbox
              id={`broker-enabled-${index}`}
              checked={!broker.disabled}
              onCheckedChange={(checked) => {
                updateField("disabled", !checked);
                setTimeout(onSave, 0);
              }}
              title={broker.disabled ? "Enable broker" : "Disable broker"}
            />
          </div>
          {canDelete && (
            <Button onClick={onDelete} size="icon" variant="ghost" className="flex-shrink-0">
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </CardHeader>
        <CollapsibleContent>
          <CardContent className="space-y-4">

        <div className="space-y-2">
          <Label htmlFor={`session-store-${index}`}>Session Store</Label>
          <Input
            id={`session-store-${index}`}
            value={broker.session_store}
            onChange={(e) => updateField("session_store", e.target.value)}
            onBlur={onSave}
            placeholder="Optional path to session store"
          />
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label htmlFor={`protocol-${index}`}>Protocol</Label>
            <Select
              value={broker.network.protocol}
              onValueChange={(value) => {
                updateNetworkField("protocol", value as any);
                setTimeout(onSave, 0);
              }}
            >
              <SelectTrigger id={`protocol-${index}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="in">IPv4 (in)</SelectItem>
                <SelectItem value="in6">IPv6 (in6)</SelectItem>
                <SelectItem value="l2">Bluetooth L2CAP (l2)</SelectItem>
                <SelectItem value="rc">Bluetooth RFCOMM (rc)</SelectItem>
                <SelectItem value="un">Unix Socket (un)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor={`encryption-${index}`}>Encryption</Label>
            <Select
              value={broker.network.encryption}
              onValueChange={(value) => {
                updateNetworkField("encryption", value as any);
                setTimeout(onSave, 0);
              }}
            >
              <SelectTrigger id={`encryption-${index}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="legacy">Legacy</SelectItem>
                <SelectItem value="tls">TLS</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor={`transport-${index}`}>Transport</Label>
            <Select
              value={broker.network.transport}
              onValueChange={(value) => {
                updateNetworkField("transport", value as any);
                setTimeout(onSave, 0);
              }}
            >
              <SelectTrigger id={`transport-${index}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="stream">Stream</SelectItem>
                <SelectItem value="websocket">WebSocket</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <NetworkAddressForm
          network={broker.network}
          onChange={(network) => updateField("network", network)}
          onSave={onSave}
        />

        <ConnectionForm
          connection={broker.mqtt || defaultMqtt}
          onChange={(mqtt) => updateField("mqtt", mqtt)}
          onSave={onSave}
        />

        <TopicsForm
          topics={broker.topics}
          onChange={(topics) => updateField("topics", topics)}
          onSave={onSave}
        />
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}