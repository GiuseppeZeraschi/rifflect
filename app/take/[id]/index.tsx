/** Feedback for one take (tasks.md T063): video, scores, points (tap to play from there), limitations. */
import { Stack, useLocalSearchParams } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { ScrollView, StyleSheet } from 'react-native';

import { takeFiles } from '@/data/files';
import { FeedbackView } from '@/features/feedback/FeedbackView';
import { TakeActions } from '@/features/feedback/TakeActions';
import { useTakeFeedback } from '@/features/feedback/useTakeFeedback';
import { analysisQueue } from '@/jobs';
import { Body, Screen } from '@/ui/components/controls';
import { usePalette } from '@/ui/theme';

export default function TakeFeedbackScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { loaded, take, report, points } = useTakeFeedback(id);
  const p = usePalette();
  const player = useVideoPlayer(take ? takeFiles.toAbsolute(take.videoPath) : null, (pl) => {
    pl.loop = false;
  });

  if (!loaded) return null;
  if (!take) {
    return (
      <Screen>
        <Body>This take no longer exists.</Body>
      </Screen>
    );
  }

  const seek = (ms: number) => {
    // expo-video seeks by assigning currentTime on the player object (its documented API).
    // eslint-disable-next-line react-hooks/immutability
    player.currentTime = ms / 1000;
    player.play();
  };

  return (
    <ScrollView style={{ backgroundColor: p.background }} testID="take-feedback">
      <Stack.Screen options={{ title: 'Feedback' }} />
      <FeedbackView
        analysisStatus={take.analysisStatus}
        report={report}
        points={points}
        onSeek={seek}
        onRetry={() => analysisQueue.retry(take.id)}
        video={<VideoView testID="take-video" player={player} nativeControls contentFit="contain" style={styles.video} />}
        actions={<TakeActions take={take} />}
      />
    </ScrollView>
  );
}


const styles = StyleSheet.create({
  video: { width: '100%', aspectRatio: 16 / 9, backgroundColor: '#000' },
});
