import { Pressable, Text, View } from "react-native";

import type { SocialUiBridge } from "../ui";

export function EditableStringListField(props: {
  ui: SocialUiBridge;
  label: string;
  items: string[];
  placeholder: string;
  addLabel: string;
  onChange: (items: string[]) => void;
}) {
  const { styles, TextInput } = props.ui;

  const updateItem = (index: number, value: string) => {
    const next = [...props.items];
    next[index] = value;
    props.onChange(next);
  };

  const removeItem = (index: number) => {
    if (props.items.length <= 1) {
      props.onChange([""]);
      return;
    }
    props.onChange(props.items.filter((_, itemIndex) => itemIndex !== index));
  };

  return (
    <View style={styles.fieldWrap as any}>
      <Text style={styles.fieldLabel as any}>{props.label}</Text>
      <View style={styles.socialEditableList as any}>
        {props.items.map((item, index) => (
          <View key={`${props.label}-${index}`} style={styles.socialEditableRow as any}>
            <TextInput
              value={item}
              onChangeText={(value: string) => updateItem(index, value)}
              placeholder={props.placeholder}
              style={[styles.input, styles.socialEditableInput] as any}
            />
            <Pressable style={styles.socialInlineRemoveBtn as any} onPress={() => removeItem(index)}>
              <Text style={styles.socialInlineRemoveText as any}>Quitar</Text>
            </Pressable>
          </View>
        ))}
      </View>
      <Pressable style={styles.socialInlineAddBtn as any} onPress={() => props.onChange([...props.items, ""])}>
        <Text style={styles.socialInlineAddText as any}>{props.addLabel}</Text>
      </Pressable>
    </View>
  );
}
