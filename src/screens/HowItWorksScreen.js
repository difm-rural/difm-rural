import React from 'react'
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { colors } from '../theme/tokens'
import Icon from '../components/Icon'

function Section({ title, body }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Text style={styles.sectionBody}>{body}</Text>
    </View>
  )
}

export default function HowItWorksScreen({ navigation }) {
  const insets = useSafeAreaInsets()
  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel="Go back">
          <Icon name="chevron-back" size={18} color={colors.primary} />
          <Text style={styles.backBtnText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle} accessibilityRole="header">How it works</Text>
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}>

        <Text style={styles.intro}>
          Rural Connections is two things in one: a place to get a hand, and a place to offer one.
        </Text>

        <Section
          title="Need something done? Post a Job."
          body="Describe what you need — fencing, a digger for a day, feed, a hand over lambing. Nearby locals send you offers, and you choose who to go with."
        />
        <Section
          title="Got something to offer? Create a Listing."
          body="Advertise a service, grazing, gear to hire, or something to sell. People can send an enquiry about a listing, or a booking request for a service or hire. A booking is confirmed when the provider accepts."
        />
        <Section
          title="The quick difference"
          body="A Job is you asking — others come to you with offers. A Listing is you offering — others come to you to take it up. You can do both from the one account."
        />
        <Section
          title="A few neighbourly basics"
          body="Agree the price and what's included before work starts. Meet in person for anything you're unsure about, and trust your judgement. Be fair and prompt — it's a small community and word travels."
        />

        <Text style={styles.closing}>Still stuck? Open Account → Help &amp; feedback → Send feedback.</Text>
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },

  header: {
    backgroundColor: colors.background,
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backBtn:     { minHeight: 36, justifyContent: 'center', flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start' },
  backBtnText: { color: colors.primary, fontSize: 15, fontWeight: '600' },
  headerTitle: { fontSize: 24, fontWeight: '700', color: colors.textPrimary, marginTop: 6 },

  content: { paddingHorizontal: 20, paddingTop: 18 },
  intro: { fontSize: 16, lineHeight: 24, color: colors.textPrimary, fontWeight: '600', marginBottom: 22 },

  section: { marginBottom: 22 },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: colors.textPrimary, marginBottom: 6 },
  sectionBody: { fontSize: 15, lineHeight: 22, color: colors.textSecondary },

  closing: { fontSize: 14, lineHeight: 20, color: colors.textMuted, marginTop: 4 },
})
