import React, { useMemo, useState } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import DateTimePickerModal from "react-native-modal-datetime-picker";

type Props = {
  label?: string;
  value?: Date;
  onChange?: (date: Date) => void;
  minuteInterval?: 1 | 2 | 3 | 4 | 5 | 6 | 10 | 12 | 15 | 20 | 30;
  minimumDate?: Date;
  maximumDate?: Date;
};

export default function DateTimeField({
  label = "Date & time",
  value,
  onChange,
  minuteInterval = 5,
  minimumDate,
  maximumDate,
}: Props) {
  const [visible, setVisible] = useState(false);
  const [date, setDate] = useState<Date>(value ?? new Date());

  const display = useMemo(
    () =>
      new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(date),
    [date]
  );

  return (
    <View style={styles.wrapper}>
      <Pressable onPress={() => setVisible(true)} style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}>
        <View style={styles.row}>
          <Text style={styles.label}>{label}</Text>
          <Text style={styles.value} numberOfLines={1}>
            {display}
          </Text>
        </View>
        <View style={styles.button}>
          <Text style={styles.buttonText}>Change</Text>
        </View>
      </Pressable>

      <DateTimePickerModal
        isVisible={visible}
        mode="datetime"
        date={date}
        onConfirm={(d) => {
          setVisible(false);
          setDate(d);
          onChange?.(d);
        }}
        onCancel={() => setVisible(false)}
        minimumDate={minimumDate}
        maximumDate={maximumDate}
        minuteInterval={minuteInterval}
        // iOS-specific niceties below are ignored on Android
        display="inline"
        locale={undefined}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { padding: 16 },
  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
    gap: 12,
  },
  cardPressed: { opacity: 0.9, transform: [{ scale: 0.997 }] },
  row: { gap: 4 },
  label: { fontSize: 14, opacity: 0.7 },
  value: { fontSize: 18, fontWeight: "600" },
  button: {
    alignSelf: "flex-start",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#f2f2f7",
  },
  buttonText: { fontSize: 14, fontWeight: "600" },
});


