import { RulesGuide } from '@/components/help/RulesGuide';
import { Screen } from '@/components/ui/Screen';

export default function HowToPlay() {
  return (
    <Screen title="How to Play" back scroll>
      <RulesGuide />
    </Screen>
  );
}
