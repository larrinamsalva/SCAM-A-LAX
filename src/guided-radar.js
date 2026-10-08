// An entirely local guided check. Answers do not become evidence or leave the tab.
import { RADAR_LEVELS } from './radar.js'

export const GUIDED_QUESTIONS = [
  {
    id: 'gift-payment', topic: 'Gift cards', points: 28,
    question: 'Did someone tell you to buy gift cards to pay them?',
    hint: 'For example, to pay a bill, fine, fee, donation, or supposed refund.',
    reason: 'Gift cards are for gifts, not payments to callers or strangers. Do not send card numbers or PINs.',
  },
  {
    id: 'gift-cover', topic: 'Gift cards', points: 26,
    question: 'Did they tell you to say the gift cards were for your family?',
    hint: 'Or tell you to hide the real reason from the cashier?',
    reason: 'An instruction to lie to a cashier is a strong warning sign. You may tell the store employee what is happening.',
  },
  {
    id: 'gift-codes', topic: 'Gift cards', points: 26,
    question: 'Did they ask for photos, numbers, or PINs from a gift card?',
    hint: 'You do not have to hand over the physical card to lose the balance.',
    reason: 'Someone who has the card number and PIN may be able to spend the balance.',
  },
  {
    id: 'refund-offer', topic: 'Refunds', points: 8,
    question: 'Did someone contact you unexpectedly about a refund?',
    hint: 'For example, a computer service, subscription, or charge you did not recognize.',
    reason: 'A refund offer alone does not prove a scam. Verify any claimed charge directly with the company or your bank.',
  },
  {
    id: 'refund-overpay', topic: 'Refunds', points: 32,
    question: 'Did they say they refunded too much and demand money back?',
    hint: 'They may show a screen or claim the refund was a mistake.',
    reason: 'A claimed overpayment can be invented to pressure you into sending your own money.',
  },
  {
    id: 'refund-fee', topic: 'Refunds', points: 26,
    question: 'Did they ask you to pay a fee before getting a refund or benefit?',
    hint: 'This might be called a processing, release, recovery, or service fee.',
    reason: 'Upfront fees to release supposed refunds, winnings, or recovered money are major warning signs.',
  },
  {
    id: 'family-emergency', topic: 'Family emergencies', points: 21,
    question: 'Did someone claim a family member needed emergency money but avoid a call back?',
    hint: 'They may say they are your grandchild or another relative and insist you cannot check the story.',
    reason: 'Call your loved one using a number you already know, or speak with another trusted family member.',
  },
  {
    id: 'police-money', topic: 'Police or government', points: 29,
    question: 'Did someone claim to be police, a sheriff, or a government agency and demand payment?',
    hint: 'Perhaps for a warrant, missed jury duty, suspended benefit, or fine.',
    reason: 'Do not pay an unexpected caller. Verify any claim through an official number you find yourself.',
  },
  {
    id: 'charity-pressure', topic: 'Military and charities', points: 14,
    question: 'Did someone pressure you to donate to a military, war relief, or sheriff program?',
    hint: 'Especially if they will not let you check the organization first.',
    reason: 'Real charities can fundraise, but urgent pressure and resistance to verification are reasons to pause.',
  },
  {
    id: 'remote-access', topic: 'Computer and phone', points: 35,
    question: 'Did someone ask to control your computer or phone remotely?',
    hint: 'For example, to fix a problem or send you a refund.',
    reason: 'Unexpected remote access could expose your information. End the session and seek trusted help.',
  },
  {
    id: 'secret-code', topic: 'Private information', points: 34,
    question: 'Did someone ask for a password, sign-in code, or bank account information?',
    hint: 'Especially a code that was texted to your phone.',
    reason: 'Do not share a one-time sign-in code or password with anyone contacting you unexpectedly.',
  },
  {
    id: 'move-money', topic: 'Your money', points: 34,
    question: 'Did they tell you to move savings to a “safe account” or cryptocurrency machine?',
    hint: 'Or to wire money or send a payment app transfer to protect it.',
    reason: 'A stranger directing you to move money for “protection” is a serious warning sign.',
  },
  {
    id: 'secrecy', topic: 'Pressure', points: 25,
    question: 'Did they tell you not to tell your family, bank, or anyone else?',
    hint: 'For example, they said the conversation must remain a secret.',
    reason: 'Secrecy can prevent you from getting help and checking whether a story is real.',
  },
  {
    id: 'threats', topic: 'Pressure', points: 28,
    question: 'Did they threaten arrest, lost benefits, or a locked account unless you paid?',
    hint: 'You do not need to make a money decision while someone is threatening you.',
    reason: 'Threats and demands for immediate payment are common manipulation tactics.',
  },
  {
    id: 'stay-on-line', topic: 'Pressure', points: 16,
    question: 'Did they rush you or demand that you stay on the phone?',
    hint: 'Including while driving to a store, bank, or gift card counter.',
    reason: 'Pressure to stay on the line can stop you from independently checking a story.',
  },
  {
    id: 'pay-for-job', topic: 'Jobs and benefits', points: 27,
    question: 'Did someone promise a job, grant, or prize but require payment first?',
    hint: 'For example, an equipment fee or payment to unlock supposed earnings.',
    reason: 'Be wary of offers that require you to send money to receive wages, grants, or prizes.',
  },
]

const VALID_ANSWERS = new Set(['yes', 'no', 'unsure'])

export function scoreGuidedAnswers(answers = {}) {
  const entries = GUIDED_QUESTIONS.filter((item) => VALID_ANSWERS.has(answers?.[item.id]))
  const warnings = entries.filter((item) => answers[item.id] === 'yes')
  const score = Math.min(100, warnings.reduce((total, item) => total + item.points, 0))
  const level = score === 0 ? null : RADAR_LEVELS.find((item) => score <= item.max)
  return {
    score,
    level: level?.id || 'UNKNOWN',
    label: level?.label || 'Unknown · safety unverified',
    warnings,
    answered: entries.length,
    unsure: entries.filter((item) => answers[item.id] === 'unsure').length,
    total: GUIDED_QUESTIONS.length,
  }
}
