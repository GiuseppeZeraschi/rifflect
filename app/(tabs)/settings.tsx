import { StyleSheet } from 'react-native';

import { Text, View } from '@/ui/components/Themed';

/** Placeholder Settings tab (app shell, T037). Replaced by the real screen in its user-story phase. */
export default function SettingsScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Settings</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 20, fontWeight: 'bold' },
});
