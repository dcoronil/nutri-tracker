import { memo, useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Ellipse, Path, Rect } from "react-native-svg";

export type BodyAvatarSvgProps = {
  bmi: number | null;
  bmiCategory: string;
  bodyFatPercent: number | null;
  latestWeightKg: number | null;
  weeklyChangeKg: number | null;
};

type TonePalette = {
  accent: string;
  segment: string;
  segmentAlt: string;
  base: string;
  contour: string;
  badgeBg: string;
  badgeBorder: string;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function paletteByBmiCategory(category: string): TonePalette {
  const normalized = category.toLowerCase();

  if (normalized.includes("under")) {
    return {
      accent: "#8ba3c7",
      segment: "#5f6f84",
      segmentAlt: "#788ba3",
      base: "#1d232a",
      contour: "#5a6878",
      badgeBg: "#121820",
      badgeBorder: "#3f4b59",
    };
  }

  if (normalized.includes("normal")) {
    return {
      accent: "#7bb8ad",
      segment: "#4f8178",
      segmentAlt: "#67968f",
      base: "#1b2422",
      contour: "#5f8d86",
      badgeBg: "#101917",
      badgeBorder: "#3e5f5a",
    };
  }

  if (normalized.includes("over")) {
    return {
      accent: "#ccb086",
      segment: "#95754d",
      segmentAlt: "#af8f62",
      base: "#282116",
      contour: "#8e744e",
      badgeBg: "#1b150d",
      badgeBorder: "#5e4d33",
    };
  }

  if (normalized.includes("obes")) {
    return {
      accent: "#c89a9a",
      segment: "#9f6666",
      segmentAlt: "#b88282",
      base: "#281a1a",
      contour: "#8f6262",
      badgeBg: "#1d1212",
      badgeBorder: "#614242",
    };
  }

  return {
    accent: "#a4a4a4",
    segment: "#767676",
    segmentAlt: "#8a8a8a",
    base: "#232323",
    contour: "#6e6e6e",
    badgeBg: "#181818",
    badgeBorder: "#424242",
  };
}

function taperedSegmentPath(centerX: number, y: number, topHalf: number, bottomHalf: number, height: number): string {
  const topLeft = centerX - topHalf;
  const topRight = centerX + topHalf;
  const bottomLeft = centerX - bottomHalf;
  const bottomRight = centerX + bottomHalf;
  const curve = Math.min(8, height * 0.2, topHalf * 0.7);

  return [
    `M ${topLeft + curve} ${y}`,
    `L ${topRight - curve} ${y}`,
    `Q ${topRight} ${y} ${topRight} ${y + curve}`,
    `L ${bottomRight} ${y + height - curve}`,
    `Q ${bottomRight} ${y + height} ${bottomRight - curve} ${y + height}`,
    `L ${bottomLeft + curve} ${y + height}`,
    `Q ${bottomLeft} ${y + height} ${bottomLeft} ${y + height - curve}`,
    `L ${topLeft} ${y + curve}`,
    `Q ${topLeft} ${y} ${topLeft + curve} ${y}`,
    "Z",
  ].join(" ");
}

function formatSignedKg(value: number | null): string {
  if (value == null) {
    return "N/D";
  }
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)} kg`;
}

export const BodyAvatarSvg = memo(function BodyAvatarSvg(props: BodyAvatarSvgProps) {
  const palette = paletteByBmiCategory(props.bmiCategory);
  const bodyFatLabel = props.bodyFatPercent != null ? `${props.bodyFatPercent.toFixed(1)}%` : "N/D";

  const geometry = useMemo(() => {
    const bmiNorm = props.bmi != null ? clamp((props.bmi - 18.5) / 13.5, 0, 1) : 0.45;
    const fatNorm = props.bodyFatPercent != null ? clamp((props.bodyFatPercent - 11) / 24, 0, 1) : 0.45;
    const bulk = clamp(bmiNorm * 0.58 + fatNorm * 0.42, 0, 1);

    const cx = 130;
    const headR = 17;
    const shoulderHalf = 50 + bulk * 11;
    const chestHalf = 42 + bulk * 9;
    const waistHalf = 28 + bulk * 12;
    const hipHalf = 34 + bulk * 11;

    const armOffset = shoulderHalf + 13;
    const armTopHalf = 8.8 + bulk * 2.7;
    const armBottomHalf = 9.8 + bulk * 2.8;

    const thighTopHalf = 11.5 + bulk * 4.2;
    const thighBottomHalf = 15.5 + bulk * 4.8;
    const calfTopHalf = 9.8 + bulk * 3.6;
    const calfBottomHalf = 8.4 + bulk * 2.8;

    return {
      cx,
      headR,
      shoulderHalf,
      chestHalf,
      waistHalf,
      hipHalf,
      armOffset,
      armTopHalf,
      armBottomHalf,
      thighTopHalf,
      thighBottomHalf,
      calfTopHalf,
      calfBottomHalf,
    };
  }, [props.bmi, props.bodyFatPercent]);

  const torsoPath = useMemo(() => {
    const shoulderY = 76;
    const chestBottom = 150;
    const waistY = 184;
    const hipY = 212;
    const pelvisBottom = 233;

    return [
      `M ${geometry.cx - geometry.shoulderHalf} ${shoulderY}`,
      `Q ${geometry.cx} ${shoulderY - 18} ${geometry.cx + geometry.shoulderHalf} ${shoulderY}`,
      `L ${geometry.cx + geometry.chestHalf} ${chestBottom}`,
      `Q ${geometry.cx + geometry.waistHalf} ${waistY} ${geometry.cx + geometry.hipHalf} ${hipY}`,
      `L ${geometry.cx + geometry.hipHalf - 8} ${pelvisBottom}`,
      `Q ${geometry.cx} ${pelvisBottom + 9} ${geometry.cx - geometry.hipHalf + 8} ${pelvisBottom}`,
      `L ${geometry.cx - geometry.hipHalf} ${hipY}`,
      `Q ${geometry.cx - geometry.waistHalf} ${waistY} ${geometry.cx - geometry.chestHalf} ${chestBottom}`,
      "Z",
    ].join(" ");
  }, [geometry]);

  const leftUpperArmPath = taperedSegmentPath(
    geometry.cx - geometry.armOffset,
    87,
    geometry.armTopHalf,
    geometry.armBottomHalf,
    73,
  );
  const rightUpperArmPath = taperedSegmentPath(
    geometry.cx + geometry.armOffset,
    87,
    geometry.armTopHalf,
    geometry.armBottomHalf,
    73,
  );
  const leftForearmPath = taperedSegmentPath(
    geometry.cx - geometry.armOffset - 2,
    158,
    geometry.armBottomHalf,
    geometry.armTopHalf - 1,
    69,
  );
  const rightForearmPath = taperedSegmentPath(
    geometry.cx + geometry.armOffset + 2,
    158,
    geometry.armBottomHalf,
    geometry.armTopHalf - 1,
    69,
  );

  const leftQuadPath = taperedSegmentPath(
    geometry.cx - 18,
    236,
    geometry.thighTopHalf,
    geometry.thighBottomHalf,
    79,
  );
  const rightQuadPath = taperedSegmentPath(
    geometry.cx + 18,
    236,
    geometry.thighTopHalf,
    geometry.thighBottomHalf,
    79,
  );
  const leftCalfPath = taperedSegmentPath(
    geometry.cx - 17,
    314,
    geometry.calfTopHalf,
    geometry.calfBottomHalf,
    76,
  );
  const rightCalfPath = taperedSegmentPath(
    geometry.cx + 17,
    314,
    geometry.calfTopHalf,
    geometry.calfBottomHalf,
    76,
  );

  const chestTop = 92;
  const chestBottom = 146;

  const leftChestPath = [
    `M ${geometry.cx - 6} ${chestTop + 1}`,
    `L ${geometry.cx - geometry.chestHalf + 6} ${chestTop + 13}`,
    `Q ${geometry.cx - geometry.chestHalf + 3} ${chestBottom - 9} ${geometry.cx - 10} ${chestBottom}`,
    `Q ${geometry.cx - 1} ${chestBottom - 26} ${geometry.cx - 6} ${chestTop + 1}`,
    "Z",
  ].join(" ");
  const rightChestPath = [
    `M ${geometry.cx + 6} ${chestTop + 1}`,
    `L ${geometry.cx + geometry.chestHalf - 6} ${chestTop + 13}`,
    `Q ${geometry.cx + geometry.chestHalf - 3} ${chestBottom - 9} ${geometry.cx + 10} ${chestBottom}`,
    `Q ${geometry.cx + 1} ${chestBottom - 26} ${geometry.cx + 6} ${chestTop + 1}`,
    "Z",
  ].join(" ");

  const leftObliquePath = [
    `M ${geometry.cx - geometry.waistHalf + 3} 154`,
    `Q ${geometry.cx - geometry.waistHalf - 1} 184 ${geometry.cx - geometry.hipHalf + 5} 213`,
    `L ${geometry.cx - 26} 202`,
    `Q ${geometry.cx - 37} 183 ${geometry.cx - 34} 156`,
    "Z",
  ].join(" ");
  const rightObliquePath = [
    `M ${geometry.cx + geometry.waistHalf - 3} 154`,
    `Q ${geometry.cx + geometry.waistHalf + 1} 184 ${geometry.cx + geometry.hipHalf - 5} 213`,
    `L ${geometry.cx + 26} 202`,
    `Q ${geometry.cx + 37} 183 ${geometry.cx + 34} 156`,
    "Z",
  ].join(" ");

  const pelvisPath = [
    `M ${geometry.cx - geometry.hipHalf + 8} 215`,
    `Q ${geometry.cx} 246 ${geometry.cx + geometry.hipHalf - 8} 215`,
    `L ${geometry.cx + 24} 213`,
    `Q ${geometry.cx} 231 ${geometry.cx - 24} 213`,
    "Z",
  ].join(" ");

  return (
    <View style={styles.wrap}>
      <View style={styles.canvasWrap}>
        <Svg width="100%" height={420} viewBox="0 0 260 420">
          <Circle cx={geometry.cx} cy={38} r={geometry.headR} fill={palette.base} stroke={palette.contour} strokeWidth={1} />
          <Rect x={geometry.cx - 12} y={56} width={24} height={16} rx={8} fill={palette.base} stroke={palette.contour} strokeWidth={1} />

          <Path d={torsoPath} fill={palette.base} stroke={palette.contour} strokeWidth={1.2} />
          <Path d={leftUpperArmPath} fill={palette.base} stroke={palette.contour} strokeWidth={1.1} />
          <Path d={rightUpperArmPath} fill={palette.base} stroke={palette.contour} strokeWidth={1.1} />
          <Path d={leftForearmPath} fill={palette.base} stroke={palette.contour} strokeWidth={1.1} />
          <Path d={rightForearmPath} fill={palette.base} stroke={palette.contour} strokeWidth={1.1} />
          <Path d={leftQuadPath} fill={palette.base} stroke={palette.contour} strokeWidth={1.1} />
          <Path d={rightQuadPath} fill={palette.base} stroke={palette.contour} strokeWidth={1.1} />
          <Path d={leftCalfPath} fill={palette.base} stroke={palette.contour} strokeWidth={1.1} />
          <Path d={rightCalfPath} fill={palette.base} stroke={palette.contour} strokeWidth={1.1} />

          <Ellipse cx={geometry.cx - (geometry.shoulderHalf - 11)} cy={84} rx={18} ry={13} fill={palette.segmentAlt} opacity={0.95} />
          <Ellipse cx={geometry.cx + (geometry.shoulderHalf - 11)} cy={84} rx={18} ry={13} fill={palette.segmentAlt} opacity={0.95} />

          <Path d={leftChestPath} fill={palette.segment} opacity={0.95} />
          <Path d={rightChestPath} fill={palette.segment} opacity={0.95} />

          <Path d={taperedSegmentPath(geometry.cx - 10.5, 149, 10.5, 9, 37)} fill={palette.segmentAlt} opacity={0.92} />
          <Path d={taperedSegmentPath(geometry.cx + 10.5, 149, 10.5, 9, 37)} fill={palette.segmentAlt} opacity={0.92} />
          <Path d={taperedSegmentPath(geometry.cx, 186, 19, 23, 30)} fill={palette.segment} opacity={0.92} />

          <Path d={leftObliquePath} fill={palette.segmentAlt} opacity={0.9} />
          <Path d={rightObliquePath} fill={palette.segmentAlt} opacity={0.9} />

          <Path d={leftUpperArmPath} fill={palette.segmentAlt} opacity={0.82} />
          <Path d={rightUpperArmPath} fill={palette.segmentAlt} opacity={0.82} />
          <Path d={leftForearmPath} fill={palette.segment} opacity={0.76} />
          <Path d={rightForearmPath} fill={palette.segment} opacity={0.76} />

          <Path d={pelvisPath} fill={palette.segment} opacity={0.94} />

          <Path d={leftQuadPath} fill={palette.segmentAlt} opacity={0.9} />
          <Path d={rightQuadPath} fill={palette.segmentAlt} opacity={0.9} />
          <Path d={taperedSegmentPath(geometry.cx - 25, 248, 7, 9, 58)} fill={palette.segment} opacity={0.72} />
          <Path d={taperedSegmentPath(geometry.cx + 25, 248, 7, 9, 58)} fill={palette.segment} opacity={0.72} />
          <Path d={leftCalfPath} fill={palette.segment} opacity={0.86} />
          <Path d={rightCalfPath} fill={palette.segment} opacity={0.86} />

          <Path d={`M ${geometry.cx} 94 L ${geometry.cx} 222`} stroke={palette.accent} strokeOpacity={0.2} strokeWidth={1} />
        </Svg>

        <View style={[styles.badge, { borderColor: palette.badgeBorder, backgroundColor: palette.badgeBg }]}> 
          <Text style={styles.badgeLabel}>% grasa</Text>
          <Text style={styles.badgeValue}>{bodyFatLabel}</Text>
        </View>
      </View>

      <View style={styles.metaRow}>
        <View style={styles.metaItem}>
          <Text style={styles.metaLabel}>IMC</Text>
          <Text style={styles.metaValue}>{props.bmi != null ? props.bmi.toFixed(1) : "N/D"}</Text>
        </View>
        <View style={styles.metaItem}>
          <Text style={styles.metaLabel}>Categoría</Text>
          <Text style={[styles.metaValue, { color: palette.accent }]}>{props.bmiCategory}</Text>
        </View>
        <View style={styles.metaItem}>
          <Text style={styles.metaLabel}>Peso</Text>
          <Text style={styles.metaValue}>{props.latestWeightKg != null ? `${props.latestWeightKg.toFixed(1)} kg` : "N/D"}</Text>
        </View>
        <View style={styles.metaItem}>
          <Text style={styles.metaLabel}>Cambio 7d</Text>
          <Text style={styles.metaValue}>{formatSignedKg(props.weeklyChangeKg)}</Text>
        </View>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: {
    gap: 12,
  },
  canvasWrap: {
    borderWidth: 1,
    borderColor: "#2a2a2a",
    borderRadius: 20,
    backgroundColor: "#0f0f0f",
    overflow: "hidden",
    position: "relative",
    paddingHorizontal: 10,
    paddingTop: 8,
    paddingBottom: 4,
  },
  badge: {
    position: "absolute",
    top: 14,
    right: 14,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    minWidth: 82,
    gap: 2,
  },
  badgeLabel: {
    color: "#b3b3b3",
    fontSize: 11,
    fontWeight: "600",
    textAlign: "right",
  },
  badgeValue: {
    color: "#f1f1f1",
    fontSize: 16,
    fontWeight: "800",
    textAlign: "right",
  },
  metaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  metaItem: {
    flex: 1,
    minWidth: 128,
    borderWidth: 1,
    borderColor: "#2a2a2a",
    borderRadius: 12,
    backgroundColor: "#141414",
    paddingHorizontal: 10,
    paddingVertical: 9,
    gap: 2,
  },
  metaLabel: {
    color: "#9f9f9f",
    fontSize: 11,
    fontWeight: "600",
  },
  metaValue: {
    color: "#f2f2f2",
    fontSize: 14,
    fontWeight: "700",
  },
});
