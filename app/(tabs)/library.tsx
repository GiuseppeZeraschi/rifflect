/** Library (tasks.md T073): unsaved drafts, saved takes newest first, search by label, storage used. */
import { router } from 'expo-router';
import { useState } from 'react';
import { FlatList, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { TakeListItem } from '@/features/library/TakeListItem';
import { UnsavedSection } from '@/features/library/UnsavedSection';
import { useLibrary } from '@/features/library/useLibrary';
import { Button } from '@/ui/components/controls';
import { fontSize, radius, spacing, usePalette } from '@/ui/theme';

export default function LibraryScreen() {
  const p = usePalette();
  const [search, setSearch] = useState('');
  const [comparing, setComparing] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const { loaded, takes, drafts, storage } = useLibrary(search);
  if (!loaded) return null;

  // Compare mode (tasks.md T098): pick exactly two takes; a third replaces the oldest pick.
  const toggle = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id].slice(-2)));
  const stopComparing = () => {
    setComparing(false);
    setSelected([]);
  };

  return (
    <SafeAreaView edges={['left', 'right']} style={[styles.flex, { backgroundColor: p.background }]}>
      <FlatList
        testID="library-list"
        data={takes}
        keyExtractor={(t) => t.id}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <View style={styles.header}>
            <UnsavedSection drafts={drafts} />
            <TextInput
              testID="library-search"
              accessibilityLabel="Search by label"
              placeholder="Search by label"
              placeholderTextColor={p.textMuted}
              value={search}
              onChangeText={setSearch}
              style={[styles.search, { color: p.text, borderColor: p.border, backgroundColor: p.surface }]}
            />
            {takes.length >= 2 ? (
              comparing ? (
                <View style={styles.compareBar}>
                  <Button
                    testID="library-compare-go"
                    label={selected.length === 2 ? 'Compare these two' : `Pick ${2 - selected.length} more`}
                    disabled={selected.length !== 2}
                    style={styles.flex}
                    onPress={() => {
                      router.push(`/compare?a=${selected[0]}&b=${selected[1]}`);
                      stopComparing();
                    }}
                  />
                  <Button testID="library-compare-cancel" variant="secondary" label="Cancel" onPress={stopComparing} />
                </View>
              ) : (
                <Button testID="library-compare" variant="secondary" label="Compare two takes" onPress={() => setComparing(true)} />
              )
            ) : null}
          </View>
        }
        renderItem={({ item }) => (
          <TakeListItem
            row={item}
            testID={`library-item-${item.id}`}
            selected={comparing ? selected.includes(item.id) : undefined}
            onPress={() => (comparing ? toggle(item.id) : router.push(`/take/${item.id}`))}
          />
        )}
        ListEmptyComponent={
          <View testID="library-empty" style={styles.empty}>
            <Text style={[styles.emptyTitle, { color: p.text }]}>{search ? 'No takes with that label' : 'No saved takes yet'}</Text>
            <Text style={{ color: p.textMuted, fontSize: fontSize.body, textAlign: 'center' }}>
              {search ? 'Try a different search.' : 'Record a take and save it to see it here.'}
            </Text>
          </View>
        }
        ListFooterComponent={
          <Text testID="storage-used" style={[styles.footer, { color: storage.low ? p.warning : p.textMuted }]}>
            Takes use {storage.takesLabel} · {storage.freeLabel} free on this phone
            {storage.low ? ' · Running low on space' : ''}
          </Text>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: spacing.lg, gap: spacing.sm },
  header: { gap: spacing.md, marginBottom: spacing.sm },
  search: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.md, padding: spacing.md, fontSize: fontSize.body, minHeight: 48 },
  empty: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xxl },
  emptyTitle: { fontSize: fontSize.title, fontWeight: '600' },
  footer: { fontSize: fontSize.caption, textAlign: 'center', marginTop: spacing.lg },
  compareBar: { flexDirection: 'row', gap: spacing.sm },
});
