import React, { useEffect, useMemo, useRef, useState } from "react";
import { View, Text, StyleSheet, Animated, ViewStyle } from "react-native";

type Props = {
  until?: number | Date;
  seconds?: number;
  onComplete?: () => void;
  running?: boolean;
  label?: string;
  containerStyle?: ViewStyle;
};

export default function SubduedCountdown({
  until,
  seconds = 300,
  onComplete,
  running = true,
  label = "DEADLINE",
  containerStyle,
}: Props) {
  const targetMs =
    until instanceof Date ? until.getTime() : typeof until === "number" ? until : Date.now() + seconds * 1000;

  const computeRemaining = () => Math.max(0, Math.floor((targetMs - Date.now()) / 1000));
  const [remaining, setRemaining] = useState(computeRemaining);
  // Capture the initial total duration in seconds so progress starts at 0%
  const totalSecondsRef = useRef<number>(Math.max(1, Math.ceil((targetMs - Date.now()) / 1000)));

  useEffect(() => {
    setRemaining(computeRemaining());
    totalSecondsRef.current = Math.max(1, Math.ceil((targetMs - Date.now()) / 1000));
  }, [targetMs]);

  useEffect(() => {
    if (!running || remaining <= 0) return;
    const id = setInterval(() => {
      setRemaining((prev) => {
        const next = Math.max(0, prev - 1);
        if (next === 0) onComplete?.();
        return next;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [running, remaining, onComplete]);

  const { hh, mm, ss } = useMemo(() => {
    const h = Math.floor(remaining / 3600);
    const m = Math.floor((remaining % 3600) / 60);
    const s = remaining % 60;
    return {
      hh: String(h).padStart(2, "0"),
      mm: String(m).padStart(2, "0"),
      ss: String(s).padStart(2, "0"),
    };
  }, [remaining]);

  // softer, slower blink for colons
  const blink = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(blink, { toValue: 0.6, duration: 900, useNativeDriver: true }),
        Animated.timing(blink, { toValue: 1, duration: 900, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [blink]);

  return (
    <View style={[styles.card, containerStyle]}>
      <Text style={styles.label}>{label}</Text>

      <View style={styles.timerRow}>
        <Text style={styles.segment}>{hh}</Text>
        <Animated.Text style={[styles.colon, { opacity: blink }]}>:</Animated.Text>
        <Text style={styles.segment}>{mm}</Text>
        <Animated.Text style={[styles.colon, { opacity: blink }]}>:</Animated.Text>
        <Text style={styles.segment}>{ss}</Text>
      </View>

      <View style={styles.unitsRow}>
        <Text style={styles.unit}>HRS</Text>
        <Text style={styles.unit}>MIN</Text>
        <Text style={styles.unit}>SEC</Text>
      </View>

      <View style={styles.track}>
        <View style={[
          styles.bar,
          {
            width: `${Math.min(100, Math.max(0, ((totalSecondsRef.current - remaining) / totalSecondsRef.current) * 100))}%`,
          },
        ]} />
      </View>
    </View>
  );
}

const COLORS = {
  text: "#0B0B0F",
  sub: "#6B7280",
  border: "#E5E7EB",
  surface: "#FFFFFF",
  accent: "#B91C1C", // softer red to match rest of app
  track: "#F3F4F6",
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
  },
  label: {
    textAlign: "center",
    color: COLORS.sub,
    letterSpacing: 1.2,
    fontSize: 12,
    marginBottom: 8,
  },
  timerRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "baseline",
  },
  segment: {
    color: COLORS.text,
    fontSize: 40,
    fontWeight: "700",
    letterSpacing: 1,
    fontVariant: ["tabular-nums"],
  },
  colon: {
    color: COLORS.accent,
    fontSize: 36,
    fontWeight: "700",
    marginHorizontal: 6,
  },
  unitsRow: {
    marginTop: 6,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 6,
  },
  unit: {
    width: "33%",
    textAlign: "center",
    color: COLORS.sub,
    fontSize: 11,
    letterSpacing: 1.2,
  },
  track: {
    height: 4,
    backgroundColor: COLORS.track,
    borderRadius: 999,
    overflow: "hidden",
    marginTop: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  bar: {
    height: "100%",
    backgroundColor: COLORS.accent,
  },
});


