// All scenarios are fictional. No real victim information or clickable scam URLs.
export const academyChoices = [
  { id: 'stop', label: 'Stop — don’t follow the request' },
  { id: 'verify', label: 'Pause — verify through a known contact' },
  { id: 'expected', label: 'Continue in the trusted app I opened' },
]

export const lessons = [
  { id: 'bank-code', category: 'Messages & accounts', title: 'The helpful bank caller', message: 'This is bank security. Read me the verification code we just texted you so I can stop fraud.', answer: 'stop', why: 'A caller asking for your sign-in code may be trying to access your account. Hang up and use the number on your card.' },
  { id: 'delivery', category: 'Messages & accounts', title: 'The tiny delivery fee', message: 'Your parcel is held. Pay a $1.20 redelivery fee using this text-message link today.', answer: 'verify', why: 'A small amount can hide a request for card details. Open the carrier’s official site yourself and check the tracking number you already have.' },
  { id: 'password-reset', category: 'Messages & accounts', title: 'The reset you requested', message: 'You opened your usual account app and requested a password reset. The app asks you to enter the code it sent. Nobody asks you to read it aloud or forward it.', answer: 'expected', why: 'This matches an action you initiated inside your trusted app. Enter the code there; keep it private and do not send it to a person.' },
  { id: 'account-alert', category: 'Messages & accounts', title: 'The account closure warning', message: 'FINAL WARNING: Your account will close in 10 minutes. Sign in through the link in this message.', answer: 'verify', why: 'A deadline and a sign-in link are reasons to pause. Open the service’s app or a saved address yourself to check for an actual alert.' },
  { id: 'support-pop-up', category: 'Messages & accounts', title: 'The talking computer warning', message: 'A pop-up says your computer is infected and tells you to call a support number and install remote-access software.', answer: 'stop', why: 'Do not call the number or grant access. Close the pop-up and use your own trusted support or security software.' },
  { id: 'prize', category: 'Money & shopping', title: 'The surprise winner', message: 'Congratulations! You won a contest you never entered. Send gift-card codes to cover the prize processing fee.', answer: 'stop', why: 'Paying with gift-card codes to receive an unexpected prize is a scam pattern. Keep the codes and your money.' },
  { id: 'overpayment', category: 'Money & shopping', title: 'The extra payment', message: 'A buyer sends a check for more than your asking price. They ask you to wire the difference to their delivery agent.', answer: 'stop', why: 'A fake check can appear available before it is rejected. Do not send a separate transfer; ask your bank to review the check.' },
  { id: 'marketplace', category: 'Money & shopping', title: 'The payment screenshot', message: 'A buyer shows a screenshot saying they paid. Your payment app shows no transaction. They want the item now.', answer: 'verify', why: 'A screenshot is not confirmation of payment. Check your own account directly before releasing an item.' },
  { id: 'investment', category: 'Money & shopping', title: 'The guaranteed profit', message: 'An online stranger promises to double your money in a week with a guaranteed cryptocurrency investment.', answer: 'stop', why: 'Promises of guaranteed high returns and pressure from a stranger are warning signs. Do not transfer money based on the promise.' },
  { id: 'receipt', category: 'Money & shopping', title: 'The purchase you recognize', message: 'Inside the store app you normally use, you find a receipt for the exact purchase you made yesterday. There is no new fee, link, or request for information.', answer: 'expected', why: 'The receipt matches a purchase you initiated and checked in your own trusted app. You do not need to respond to anyone or provide new information.' },
  { id: 'task-job', category: 'Jobs & opportunities', title: 'The job that needs a deposit', message: 'Earn money liking videos. Your account shows $600, but you must deposit $100 in crypto to unlock withdrawals.', answer: 'stop', why: 'Paying to unlock supposed earnings is a task-scam pattern. A displayed balance does not establish that real wages exist.' },
  { id: 'equipment-check', category: 'Jobs & opportunities', title: 'The new-job equipment check', message: 'A new employer sends a check. Deposit it, then send part of the money to their equipment supplier using a payment app.', answer: 'stop', why: 'The check may be fake. Do not forward the funds; verify the employer independently and ask your bank to review the check.' },
  { id: 'job-interview', category: 'Jobs & opportunities', title: 'The interview invitation', message: 'You receive an interview invitation for a job you applied for, but you have not yet verified the sender or meeting details.', answer: 'verify', why: 'An expected invitation still needs a sender check. Confirm through the employer’s independently located recruiting contact before sharing sensitive information.' },
  { id: 'reshipping', category: 'Jobs & opportunities', title: 'The package-forwarding job', message: 'Your work-from-home job is to receive electronics, remove the original receipts, and send the packages to another address.', answer: 'stop', why: 'This matches a reshipping scam pattern. The goods may have been bought with stolen payment details; do not accept or forward them as instructed.' },
  { id: 'application', category: 'Jobs & opportunities', title: 'The application you started', message: 'You navigated independently to the real employer’s careers site. Your application dashboard shows your submitted application and lets you update your resume. No payment is requested.', answer: 'expected', why: 'You are continuing a process you started on a site you independently verified. Keep checking the address and avoid requests to pay for a job.' },
  { id: 'family-emergency', category: 'People & impersonation', title: 'The new-number emergency', message: 'Hi Mom, this is my new number. I need money immediately. Please don’t call my old number or tell anyone.', answer: 'verify', why: 'Urgency and a new number are reasons to check. Call your family member using a number you already know, even if the message tells you not to.' },
  { id: 'romance', category: 'People & impersonation', title: 'The online relationship request', message: 'Someone you have only met online says they love you, then asks you to send money for an emergency and keep it secret.', answer: 'stop', why: 'A money request and secrecy in an online-only relationship are warning signs. Pause contact and talk with someone you trust.' },
  { id: 'celebrity', category: 'People & impersonation', title: 'The private celebrity account', message: 'A second account claiming to be your favorite performer offers a private meet-up if you pay a membership fee by gift card.', answer: 'stop', why: 'A name or copied photo does not prove identity. Do not pay the account; check announcements through independently verified official channels.' },
  { id: 'recovery', category: 'People & impersonation', title: 'The recovery expert', message: 'I can recover all the money you lost. Guaranteed recovery! Send an upfront recovery fee before I start.', answer: 'stop', why: 'Unexpected recovery offers can target people a second time. Contact your original payment provider directly rather than paying this person.' },
  { id: 'charity', category: 'People & impersonation', title: 'The donation request', message: 'An unfamiliar account shares an emotional fundraiser and asks you to donate using its link. You have not checked the organization.', answer: 'verify', why: 'A moving story does not verify the organizer. Independently check the charity and navigate to its official donation channel before deciding.' },
]

export const supportOptions = [
  { id: 'money', title: 'I sent money', detail: 'A card payment, bank transfer, payment app, gift card, or crypto.' },
  { id: 'account', title: 'I shared account information', detail: 'A password, sign-in code, or personal information.' },
  { id: 'device', title: 'I gave someone device access', detail: 'Remote-access software or control of a computer or phone.' },
]

export function getSupportSteps(selected = []) {
  const steps = [
    { id: 'pause', title: 'Stop the conversation', detail: 'Stop replying and pause any further payments. Use your own trusted contact details to check what happened.' },
  ]
  if (selected.includes('money')) steps.push({ id: 'provider', title: 'Contact the payment provider promptly', detail: 'Use the number on your card or the provider’s official app/site. Explain the scam and ask whether the payment can be stopped or reversed. Keep gift cards and receipts. A refund is not guaranteed.' })
  if (selected.includes('device')) steps.push({ id: 'device', title: 'Regain control of the device', detail: 'End remote access and seek help from a support provider you already trust. Check the device with trusted security software. Use a different trusted device for sensitive account changes if access may still be compromised.' })
  if (selected.includes('account')) steps.push({ id: 'account', title: 'Secure exposed accounts', detail: 'From a trusted device, change exposed and reused passwords, review sign-in sessions, and enable multi-factor authentication. If identity information was shared, use the official identity-theft recovery site below.' })
  steps.push(
    { id: 'evidence', title: 'Keep a record', detail: 'Save messages, receipts, transaction references, and original screenshots. A local case can organize your notes and file-hash receipts.' },
    { id: 'report', title: 'Choose a reporting channel', detail: 'Report to the relevant platform or institution. The official U.S. resources below can help; elsewhere, use the appropriate local consumer-protection agency.' },
    { id: 'recovery', title: 'Watch for follow-up recovery offers', detail: 'Do not pay an unexpected person who promises to recover your money for an upfront fee.' },
  )
  return steps
}

export const officialResources = [
  { title: 'FTC: steps after a scam', href: 'https://consumer.ftc.gov/articles/what-do-if-you-were-scammed' },
  { title: 'Report fraud to the FTC', href: 'https://reportfraud.ftc.gov/' },
  { title: 'IdentityTheft.gov recovery guidance', href: 'https://www.identitytheft.gov/' },
]
