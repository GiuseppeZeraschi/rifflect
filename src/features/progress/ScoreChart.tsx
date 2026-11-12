/**
 * Timing and technique over time (tasks.md T097, FR-020): one point per take, gaps for null scores,
 * square markers on takes played over accompaniment (FR-030). Skia-based (victory-native).
 */
import { CartesianChart, Line, Scatter } from 'victory-native';
import { StyleSheet, Text, View } from 'react-native';

import type { SeriesPoint } from '@/data/repositories/progressRepo';
import { fontSize, spacing, usePalette } from '@/ui/theme';

export function ScoreChart({ series }: { series: SeriesPoint[] }) {
  const p = usePalette();
  const data = series.map((s, i) => ({
    i,
    timing: s.timingScore,
    technique: s.techniqueScore,
    accompanied: s.accompanimentKind !== 'none' ? (s.timingScore ?? s.techniqueScore) : null,
  }));
  const first = series[0];
  const last = series[series.length - 1];
  const describe = (s: SeriesPoint | undefined) =>
    s ? `timing ${s.timingScore ?? 'no score'}, technique ${s.techniqueScore ?? 'no score'}` : '';

  return (
    <View
      testID="chart-scores"
      accessible
      accessibilityLabel={`Score chart for ${series.length} takes. First take ${describe(first)}. Latest take ${describe(last)}.`}
      style={styles.root}>
      <View style={styles.chart}>
        <CartesianChart data={data} xKey="i" yKeys={['timing', 'technique', 'accompanied']} domain={{ y: [0, 100] }} domainPadding={{ left: 12, right: 12, top: 8, bottom: 8 }}>
          {({ points }) => (
            <>
              <Line points={points.timing} color={p.timing} strokeWidth={3} connectMissingData={false} />
              <Line points={points.technique} color={p.technique} strokeWidth={3} connectMissingData={false} />
              <Scatter points={points.timing} color={p.timing} radius={4} />
              <Scatter points={points.technique} color={p.technique} radius={4} />
              <Scatter points={points.accompanied} color={p.text} radius={6} shape="square" style="stroke" strokeWidth={2} />
            </>
          )}
        </CartesianChart>
      </View>
      <View style={styles.legend}>
        <Text style={[styles.key, { color: p.timing }]}>● Timing</Text>
        <Text style={[styles.key, { color: p.technique }]}>● Technique</Text>
        {data.some((d) => d.accompanied !== null) ? <Text style={[styles.key, { color: p.text }]}>□ Over a loop/backing</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.sm },
  chart: { height: 200 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  key: { fontSize: fontSize.caption, fontWeight: '600' },
});
