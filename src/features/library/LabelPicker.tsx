/** Pick an existing practice-item label, type a new one, or choose none (tasks.md T071, `label-picker`). */
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { desc, sql } from 'drizzle-orm';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { db } from '@/data/db/client';
import { practiceItem } from '@/data/db/schema';
import { fontSize, radius, spacing, usePalette } from '@/ui/theme';
import type { LabelChoice } from './takeActions';

export function LabelPicker({ value, onChange }: { value: LabelChoice; onChange: (c: LabelChoice) => void }) {
  const p = usePalette();
  const { data: items } = useLiveQuery(
    db.select().from(practiceItem).orderBy(sql`${practiceItem.lastUsedAt} IS NULL`, desc(practiceItem.lastUsedAt)),
  );
  const [draft, setDraft] = useState(value && 'newName' in value ? value.newName : '');
  const selectedId = value && 'itemId' in value ? value.itemId : null;

  const chip = (label: string, selected: boolean, onPress: () => void, testID: string) => (
    <Pressable
      key={testID}
      testID={testID}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={[styles.chip, { borderColor: selected ? p.primary : p.border, backgroundColor: selected ? p.surface : p.background }]}>
      <Text style={{ color: p.text, fontSize: fontSize.body }}>{label}</Text>
    </Pressable>
  );

  return (
    <View testID="label-picker" style={styles.root}>
      <Text style={[styles.title, { color: p.text }]}>What were you practising?</Text>
      <View style={styles.chips} accessibilityRole="radiogroup">
        {chip('No label', value === null, () => onChange(null), 'label-none')}
        {items.map((it) => chip(it.name, selectedId === it.id, () => onChange({ itemId: it.id }), `label-item-${it.id}`))}
      </View>
      <TextInput
        testID="label-new"
        accessibilityLabel="New label"
        placeholder="New label, e.g. “F barre chord”"
        placeholderTextColor={p.textMuted}
        value={draft}
        maxLength={60}
        onChangeText={(t) => {
          setDraft(t);
          onChange(t.trim() ? { newName: t } : null);
        }}
        style={[styles.input, { color: p.text, borderColor: p.border, backgroundColor: p.surface }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.sm },
  title: { fontSize: fontSize.body, fontWeight: '600' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: { borderWidth: 2, borderRadius: radius.lg, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, minHeight: 40, justifyContent: 'center' },
  input: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.md, padding: spacing.md, fontSize: fontSize.body, minHeight: 48 },
});
