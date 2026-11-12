import { Tabs } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import type { ColorValue } from 'react-native';

import { useColorScheme } from '@/ui/components/useColorScheme';
import Colors from '@/ui/constants/Colors';

type IconName = { ios: string; android: string };

function tabIcon(name: IconName) {
  function TabIcon({ color }: { color: ColorValue }) {
    return <SymbolView name={name as never} tintColor={color} size={26} />;
  }
  return TabIcon;
}

export default function TabLayout() {
  const colorScheme = useColorScheme();

  return (
    <Tabs screenOptions={{ tabBarActiveTintColor: Colors[colorScheme].tint }}>
      <Tabs.Screen
        name="record"
        options={{ title: 'Record', tabBarIcon: tabIcon({ ios: 'video', android: 'videocam' }) }}
      />
      <Tabs.Screen
        name="library"
        options={{
          title: 'Library',
          tabBarIcon: tabIcon({ ios: 'film.stack', android: 'video_library' }),
        }}
      />
      <Tabs.Screen
        name="progress"
        options={{
          title: 'Progress',
          tabBarIcon: tabIcon({ ios: 'chart.xyaxis.line', android: 'show_chart' }),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{ title: 'Settings', tabBarIcon: tabIcon({ ios: 'gearshape', android: 'settings' }) }}
      />
    </Tabs>
  );
}
