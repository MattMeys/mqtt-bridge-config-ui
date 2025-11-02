import { Topic } from "../types/mqtt-bridge";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Button } from "./ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Plus, Trash2 } from "lucide-react";

interface TopicsFormProps {
  topics: Topic[];
  onChange: (topics: Topic[]) => void;
}

export function TopicsForm({ topics, onChange }: TopicsFormProps) {
  const addTopic = () => {
    onChange([...topics, { topic: "#", qos: 0 }]);
  };

  const removeTopic = (index: number) => {
    onChange(topics.filter((_, i) => i !== index));
  };

  const updateTopic = (index: number, field: keyof Topic, value: any) => {
    const newTopics = [...topics];
    newTopics[index] = { ...newTopics[index], [field]: value };
    onChange(newTopics);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Label>Topics</Label>
        <Button onClick={addTopic} size="sm" variant="outline">
          <Plus className="h-4 w-4 mr-2" />
          Add Topic
        </Button>
      </div>

      <div className="space-y-3">
        {topics.map((topic, index) => (
          <div key={index} className="flex gap-3 items-end p-3 bg-secondary rounded-lg">
            <div className="flex-1 space-y-2">
              <Label htmlFor={`topic-${index}`}>Topic Pattern</Label>
              <Input
                id={`topic-${index}`}
                value={topic.topic}
                onChange={(e) => updateTopic(index, "topic", e.target.value)}
                placeholder="e.g., #, sensor/+/temperature"
              />
            </div>

            <div className="w-48 space-y-2">
              <Label htmlFor={`qos-${index}`}>QoS</Label>
              <Select
                value={topic.qos.toString()}
                onValueChange={(value) => updateTopic(index, "qos", parseInt(value))}
              >
                <SelectTrigger id={`qos-${index}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">0 - At most once</SelectItem>
                  <SelectItem value="1">1 - At least once</SelectItem>
                  <SelectItem value="2">2 - Exactly once</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button
              onClick={() => removeTopic(index)}
              size="icon"
              variant="destructive"
              disabled={topics.length === 1}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}