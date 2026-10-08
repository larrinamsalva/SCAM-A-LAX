export const HELP_QUESTION_LIMIT = 400

export const helpQuickTopics = [
  { id: 'save', label: 'Save my story' },
  { id: 'find', label: 'Find my record' },
  { id: 'backup', label: 'Back up my cases' },
  { id: 'packet', label: 'Prepare a report' },
]

const casesAction = { route: 'cases', label: 'Go to My cases' }
const guideAction = { route: 'guide', label: 'Open the five-step guide' }
const supportAction = { route: 'help', label: 'Open the response checklist' }

const topics = {
  start: {
    title: 'Start with one clear step',
    text: 'Save a new case keeps your case and story together. You can add more records later.',
    steps: [
      'Open My cases and select Save a new case.',
      'Describe What happened? A case name, date, and approximate loss are optional.',
      'Select Continue to evidence, add optional details, then Review case → Save case.',
      'Look for Case and story saved in this browser and your words in Scam Ledger.',
      'Download a copy with Backup workspace. Keep original files separately.',
    ],
    actions: [guideAction, casesAction],
  },
  save: {
    title: 'Save your story as a record',
    text: 'Save a new case saves the case and your story together. An advanced empty folder does not add your story.',
    steps: [
      'For a new incident, open My cases and select Save a new case. Describe What happened?',
      'Select Continue to evidence. Add a screenshot or contact details if needed, then select Review case.',
      'Check the preview and select Save case. Look for the saved confirmation and your words in Scam Ledger.',
      'For a dated call or message, use Call & message log, review the details, then Save contact record.',
      'For an existing case, open Scam Ledger, enter Message or what happened, and select Save record. Check the saved words and that the count increases.',
    ],
    actions: [casesAction],
  },
  find: {
    title: 'Find or check a saved record',
    text: 'Use the case’s saved records list to check what was added.',
    steps: [
      'Open My cases in the same browser and on the same device where you made the case.',
      'Use Find a saved case to search story words, a case name, ID, or file name. Clear filters if they hide your case. Select the case, then open Scam Ledger.',
      'If it shows 0 saved records, the folder exists but no story has been added. Enter your words and select Save record.',
      'If the count is above zero, look for your words in the saved records list. Add a clarification to a user statement to correct it without replacing the original.',
      'Check a message does not search a shared report database or save a case record. Copy text you want to keep and add it through Save record.',
    ],
    actions: [casesAction, guideAction],
  },
  backup: {
    title: 'Keep a copy of your cases',
    text: 'Backup workspace downloads your whole case workspace. A Case Packet is a report for one case.',
    steps: [
      'Open My cases and save any record you are still typing.',
      'Select Backup workspace. Look for the downloaded JSON file in your browser’s downloads.',
      'Keep the backup somewhere you can find it before clearing browser data.',
      'The JSON backup includes screenshots saved with a viewable copy. Keep original files separately too; receipt-only files are not included as images.',
    ],
    actions: [casesAction],
  },
  packet: {
    title: 'Prepare a report to share',
    text: 'A downloaded report is yours to review and share. Downloading it does not send it to anyone.',
    steps: [
      'Open My cases and select the case you want to report.',
      'Open Case Packet. On a phone, swipe the tab row that starts with Scam Ledger to find it.',
      'Select Download Markdown packet for a text report, or Download JSON archive for a structured copy.',
      'Review the file before sharing it. Use Backup workspace separately to keep a copy of all your cases.',
    ],
    actions: [casesAction, supportAction],
  },
  check: {
    title: 'Check a message, then keep it if needed',
    text: 'Scam radar shows the strength of matched warning signs, from Low concern to Very high concern. It does not measure the chance of a scam or guarantee safety.',
    steps: [
      'Open Check a message and paste the words you want to review. Leave out passwords, codes, and account numbers.',
      'Select Check this message. Read the Scam radar level and the matched reasons. Unknown or Low concern does not mean safe.',
      'Copy any words you want to keep before leaving that page. The check does not save them.',
      'In My cases, choose your case, open Scam Ledger, paste the words into Message or what happened, and select Save record.',
    ],
    actions: [{ route: 'check', label: 'Go to Check a message' }, casesAction],
  },
  support: {
    title: 'Open the response checklist',
    text: 'Get help has a checklist for something that already happened.',
    steps: [
      'Open Get help and choose the situations that apply to you.',
      'Read each next step and tick it when you have completed it.',
      'Use the official resource links on that page when you are ready. This helper does not submit a report.',
      'Use My cases to keep your story and supporting details together.',
    ],
    actions: [supportAction, casesAction],
  },
  privacy: {
    title: 'Know where your information stays',
    text: 'Saved cases stay in this browser on this device. They are not a shared or cloud workspace.',
    steps: [
      'Use the same browser and device to find your saved cases.',
      'Browser storage is not encrypted. Other people using the same browser profile may be able to read cases.',
      'Download Backup workspace before clearing browser data. Keep original files separately.',
      'Helper questions stay in this tab and disappear on refresh. They do not become case records; use Save record to keep your story.',
    ],
    actions: [casesAction],
  },
  files: {
    title: 'Save a screenshot with your case',
    text: 'Scam Ledger can keep a viewable screenshot in this browser and include it in JSON backups. Other files can still be kept as receipts.',
    steps: [
      'In My cases, select your case and open Scam Ledger.',
      'Use Screenshot or original file (optional) to choose a PNG, JPG, or WebP image up to 10 MB. Leave Save a viewable copy with this case checked.',
      'Type or paste the message’s words into Message or what happened if you want to check them. Image text is not read automatically.',
      'Select Save record. Check the saved records list for your image, then select View screenshot to open it.',
      'Use Check record text to open the scam radar for the words you entered. Use Backup workspace to keep a JSON copy including the saved image.',
    ],
    actions: [casesAction],
  },
  academy: {
    title: 'Practice in Scam Academy',
    text: 'Scam Academy has twenty fictional situations to practice on.',
    steps: [
      'Open Scam Academy and choose a situation.',
      'Read the message, choose an answer, and read the explanation.',
      'Use the Topic filter to try another area. Practice progress stays in this browser.',
    ],
    actions: [{ route: 'academy', label: 'Go to Scam Academy' }],
  },
  numbers: {
    title: 'Track a number in your saved cases',
    text: 'Number tracker searches phone numbers mentioned in this browser’s saved case records. A match is a lead to review, not a scam verdict.',
    steps: [
      'To keep a number, open My cases, select your case, choose Kind → phone in Scam Ledger, enter the number, and select Save record.',
      'Open Number tracker and enter the phone number. Use the same country-code format as your record.',
      'Select Search saved cases, or choose a number from the saved number index.',
      'Review the matching cases and original evidence labels. Select Open this case to read the case.',
      'No local match does not mean a number is safe. This tracker does not search public scam reports.',
    ],
    actions: [{ route: 'numbers', label: 'Go to Number tracker' }, casesAction],
  },
  unknown: {
    title: 'Let’s choose an app step',
    text: 'I use the app’s built-in directions. Try asking how to save a story, find a record, make a backup, or prepare a report.',
    steps: ['For steps after something happened, open the response checklist. For a walkthrough of keeping your story, open the five-step guide.'],
    actions: [guideAction, supportAction],
  },
}

export function getHelpTopic(id) {
  const topic = Object.hasOwn(topics, id) ? id : 'unknown'
  return { id: topic, ...topics[topic] }
}

export function getPageHelp(route) {
  const topic = { home: 'start', guide: 'start', cases: 'save', check: 'check', numbers: 'numbers', help: 'support', academy: 'academy' }[route]
  return getHelpTopic(topic || 'start')
}

export function answerHelpQuestion(question, route = 'home') {
  if (typeof question !== 'string' || question.length > HELP_QUESTION_LIMIT) return getHelpTopic('unknown')
  const text = question.trim().toLowerCase().replace(/[’‘]/g, "'")
  if (!text) return getHelpTopic('unknown')

  // Only known app directions are returned. Questions never execute actions.
  if (/\b(restore|import|delete|erase)\b/.test(text)) return getHelpTopic('unknown')
  if (/\b(scammed|hacked|threatened)\b|\b(sent|lost|paid|gave|shared)\b.{0,48}\b(money|passwords?|codes?|access|bank|account|gift cards?)\b/.test(text)) return getHelpTopic('support')
  if (/\b(no|zero|0)\s+(saved\s+)?records?\b|\b(can't|cannot|cant|missing|disappeared|vanished|lost)\b.{0,50}\b(case|story|record)s?\b|\b(find|where)\b.{0,50}\b(case|story|record|saved)s?\b|\b(empty|blank)\s+(case|folder)\b|\b(case|folder)\b.{0,20}\b(empty|blank)\b/.test(text)) return getHelpTopic('find')
  if (/\b(back ?up|backup)\b/.test(text)) return getHelpTopic('backup')
  if (/\b(report|packet|export|share|handoff|police)\b/.test(text)) return getHelpTopic('packet')
  if (/\b(number tracker|number lookup|phone number|caller|telephone)\b|\b(track|lookup|look up)\b.{0,24}\b(number|phone)\b/.test(text)) return getHelpTopic('numbers')
  if (/\b(radar|meter|risk level)\b/.test(text)) return getHelpTopic('check')
  if (/\b(check|analyze|analyse|warning|legit|safe|suspicious)\b.{0,40}\b(message|email|text|scam|link|website)\b|\b(scamcheck|is this a scam)\b/.test(text)) return getHelpTopic('check')
  if (/\b(private|privacy|upload|cloud|online|encrypt\w*|account|login|device|browser|storage)\b/.test(text)) return getHelpTopic('privacy')
  if (/\b(phone|caller|telephone|number tracker|number lookup)\b/.test(text)) return getHelpTopic('numbers')
  if (/\b(file|screenshot|photo|image|attachment|hash|receipt)s?\b/.test(text)) return getHelpTopic('files')
  if (/\b(learn|practice|academy|lesson|quiz)\b/.test(text)) return getHelpTopic('academy')
  if (/\b(save|saving|record|story|note|create|new case|add|case folder)\b/.test(text)) return getHelpTopic('save')
  if (/\b(start|first|next|help|directions)\b|how.*work|use this/.test(text)) return getPageHelp(route)
  return getHelpTopic('unknown')
}
