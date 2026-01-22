import { Bridge, defaultBroker } from "../types/mqtt-bridge";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Plus, Trash2, ChevronDown } from "lucide-react";
import { BrokerForm } from "./BrokerForm";
import { Alert, AlertDescription } from "./ui/alert";
import { AlertCircle } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "./ui/collapsible";
import { Checkbox } from "./ui/checkbox";
import { useState } from "react";

interface BridgeFormProps {
  bridge: Bridge;
  index: number;
  onChange: (bridge: Bridge) => void;
  onSave: () => void;
  onDelete: () => void;
}

export function BridgeForm({ bridge, index, onChange, onSave, onDelete }: BridgeFormProps) {
  const [isOpen, setIsOpen] = useState(true);
  const updateField = <K extends keyof Bridge>(field: K, value: Bridge[K]) => {
    onChange({ ...bridge, [field]: value });
  };

  const addBroker = () => {
    updateField("brokers", [...bridge.brokers, { ...defaultBroker }]);
    // Send changes immediately when adding a broker (button click)
    setTimeout(onSave, 0);
  };

  const removeBroker = (brokerIndex: number) => {
    updateField("brokers", bridge.brokers.filter((_, i) => i !== brokerIndex));
    // Send changes immediately when removing a broker (button click)
    setTimeout(onSave, 0);
  };

  const updateBroker = (brokerIndex: number, broker: any) => {
    const newBrokers = [...bridge.brokers];
    newBrokers[brokerIndex] = broker;
    updateField("brokers", newBrokers);
  };

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card className={`border-2 ${bridge.disabled ? 'opacity-50' : ''}`}>
        <CardHeader className="flex flex-row items-center gap-3 space-y-0 pb-3 pt-3 bg-muted/50">
          <CollapsibleTrigger className="flex items-center gap-2 hover:opacity-70 transition-opacity flex-shrink-0">
            <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            <span className="text-sm text-muted-foreground">Bridge {index + 1}</span>
          </CollapsibleTrigger>
          <div className="flex-1">
            <Input
              id={`bridge-name-${index}`}
              value={bridge.name}
              onChange={(e) => updateField("name", e.target.value)}
              onBlur={onSave}
              placeholder="Bridge name (required)"
              required
              className="h-9 bg-white"
            />
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Checkbox
              id={`bridge-enabled-${index}`}
              checked={!bridge.disabled}
              onCheckedChange={(checked) => {
                updateField("disabled", !checked);
                setTimeout(onSave, 0);
              }}
              title={bridge.disabled ? "Enable bridge" : "Disable bridge"}
            />
          </div>
          <Button onClick={onDelete} size="icon" variant="ghost" className="flex-shrink-0">
            <Trash2 className="h-4 w-4" />
          </Button>
        </CardHeader>
        <CollapsibleContent>
          <CardContent className="space-y-6 pt-0">

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label>Brokers</Label>
              <p className="text-sm text-muted-foreground mt-1">
                At least 2 brokers required
              </p>
            </div>
            <Button onClick={addBroker} size="sm" variant="outline">
              <Plus className="h-4 w-4 mr-2" />
              Add Broker
            </Button>
          </div>

          {bridge.brokers.length < 2 && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                A bridge requires at least 2 brokers to function properly.
              </AlertDescription>
            </Alert>
          )}

          <div className="space-y-4">
            {bridge.brokers.map((broker, brokerIndex) => (
              <BrokerForm
                key={brokerIndex}
                broker={broker}
                index={brokerIndex}
                canDelete={bridge.brokers.length > 2}
                onChange={(updatedBroker) => updateBroker(brokerIndex, updatedBroker)}
                onSave={onSave}
                onDelete={() => removeBroker(brokerIndex)}
              />
            ))}
          </div>
        </div>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}