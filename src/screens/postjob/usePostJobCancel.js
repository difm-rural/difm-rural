import { useCallback, useEffect, useRef } from 'react'
import { Alert, BackHandler, Keyboard } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useFocusEffect, useNavigation } from '@react-navigation/native'
import { usePostJob } from '../../context/PostJobContext'
import { cancelPrompt, wizardExit, wizardIsEdit } from '../../../shared/postJobCancel'

// A guest who reached sign-in has this job saved to post after login. Discarding it
// must drop that copy too, but never a different job's.
async function dropPendingGuestJob(draftJobId) {
  const raw = await AsyncStorage.getItem('pendingJob')
  if (!raw || !draftJobId) return
  let id = null
  try { id = JSON.parse(raw)?.id } catch { return }
  if (id === draftJobId) await AsyncStorage.removeItem('pendingJob')
}

// Cancel for every step of the wizard. Back is untouched, except that Android's Back
// (and the iOS swipe) on Step 1 leaves the wizard, so it asks the same question.
// `busy`: a save is under way, so neither Cancel nor Android Back may leave.
// `extraChanges`: something typed on the screen that is not in the draft yet.
export function usePostJobCancel({ currentStep, busy = false, extraChanges = false }) {
  const navigation = useNavigation()
  const { jobData, jobChanged, resetJobData } = usePostJob()
  const changed = jobChanged || extraChanges
  const leaving = useRef(false)

  function leave() {
    if (leaving.current) return
    leaving.current = true
    const exit = wizardExit(navigation.getState())
    const parent = navigation.getParent()
    resetJobData()
    if (exit.pop) { navigation.pop(exit.pop); return }
    navigation.reset({ index: 0, routes: [{ name: exit.root }] })
    if (parent?.canGoBack()) parent.goBack()
  }

  async function discard() {
    try { await dropPendingGuestJob(jobData.draftJobId) } catch {
      Alert.alert('Could not discard the job', 'Please try again.')
      return
    }
    leave()
  }

  function cancel() {
    if (busy || leaving.current) return
    Keyboard.dismiss()
    if (!changed) { leave(); return }
    const prompt = cancelPrompt(wizardIsEdit(navigation.getState()))
    Alert.alert(prompt.title, prompt.message, [
      { text: prompt.keep, style: 'cancel' },
      { text: prompt.discard, style: 'destructive', onPress: () => { void discard() } },
    ], { cancelable: true })
  }

  const latest = useRef(cancel)
  latest.current = cancel
  useFocusEffect(useCallback(() => {
    if (currentStep !== 1 && !busy) return undefined
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!busy) latest.current()
      return true
    })
    return () => subscription.remove()
  }, [currentStep, busy]))

  const swipeBlocked = busy || (currentStep === 1 && changed)
  useEffect(() => { navigation.setOptions({ gestureEnabled: !swipeBlocked }) }, [navigation, swipeBlocked])

  return cancel
}
