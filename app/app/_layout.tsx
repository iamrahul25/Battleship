import { BlackOpsOne_400Regular } from '@expo-google-fonts/black-ops-one';
import { Rajdhani_500Medium, Rajdhani_600SemiBold, Rajdhani_700Bold } from '@expo-google-fonts/rajdhani';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { loadShipSprites } from '@/art/shipSprites';
import { SoundManager } from '@/audio/SoundManager';
import { ToastHost } from '@/components/ui/ToastHost';
import { useHydrated } from '@/stores/hydration';
import { colors } from '@/theme';

SplashScreen.preventAutoHideAsync().catch(() => undefined);

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    BlackOpsOne_400Regular,
    Rajdhani_500Medium,
    Rajdhani_600SemiBold,
    Rajdhani_700Bold,
  });
  const hydrated = useHydrated();
  const [spritesLoaded, setSpritesLoaded] = useState(false);
  const ready = (fontsLoaded || !!fontError) && hydrated && spritesLoaded;

  useEffect(() => {
    SoundManager.init();
    loadShipSprites().finally(() => setSpritesLoaded(true));
  }, []);

  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => undefined);
  }, [ready]);

  if (!ready) return <View style={{ flex: 1, backgroundColor: colors.navy900 }} />;

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.navy900 }}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerShown: false,
            animation: 'fade_from_bottom',
            animationDuration: 300,
            contentStyle: { backgroundColor: colors.navy900 },
          }}
        >
          <Stack.Screen name="index" options={{ animation: 'none' }} />
          <Stack.Screen name="placement" options={{ gestureEnabled: false }} />
          <Stack.Screen name="battle" options={{ gestureEnabled: false, animation: 'fade' }} />
          <Stack.Screen name="result" options={{ gestureEnabled: false, animation: 'fade' }} />
          <Stack.Screen name="online/matchmaking" options={{ gestureEnabled: false }} />
        </Stack>
        <ToastHost />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
