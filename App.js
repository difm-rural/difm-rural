import React, { useState } from 'react'
import { StatusBar } from 'expo-status-bar'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import AppNavigator from './src/navigation/AppNavigator'
import { UserProvider } from './src/context/UserContext'
import ErrorBoundary from './src/components/ErrorBoundary'

export default function App() {
  // Bumping the key remounts the navigator after "Go back" on the crash screen.
  const [attempt, setAttempt] = useState(0)
  return (
    <SafeAreaProvider>
      {/* Dark status-bar icons so the time/signal/battery stay visible on the
          app's light headers (Android defaulted to invisible white icons). */}
      <StatusBar style="dark" />
      <ErrorBoundary onReset={() => setAttempt(value => value + 1)}>
        <UserProvider key={attempt}>
          <AppNavigator />
        </UserProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  )
}
