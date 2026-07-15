import React from 'react'
import { StatusBar } from 'expo-status-bar'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import AppNavigator from './src/navigation/AppNavigator'
import { UserProvider } from './src/context/UserContext'

export default function App() {
  return (
    <SafeAreaProvider>
      {/* Dark status-bar icons so the time/signal/battery stay visible on the
          app's light headers (Android defaulted to invisible white icons). */}
      <StatusBar style="dark" />
      <UserProvider>
        <AppNavigator />
      </UserProvider>
    </SafeAreaProvider>
  )
}