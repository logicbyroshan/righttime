import React, { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import { getDatabase } from '@/db/database';
import { startWifiMonitoring } from '@/services/wifiMonitorService';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const scheme = useColorScheme();

  useEffect(() => {
    let cleanupWifi: (() => void) | undefined;
    try {
      // Initialize local SQLite database
      getDatabase();
      cleanupWifi = startWifiMonitoring();
    } catch (e) {
      console.error('Database initialization or Wi-Fi monitoring error:', e);
    } finally {
      SplashScreen.hideAsync();
    }

    return () => {
      if (cleanupWifi) {
        cleanupWifi();
      }
    };
  }, []);

  return (
    <>
      <StatusBar style={scheme === 'light' ? 'dark' : 'light'} />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      </Stack>
    </>
  );
}
