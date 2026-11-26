/* DealCraft — hirer app. Bangla default. Defensive fetch against the API contract. */
(function(){
'use strict';
var API=''; // same origin; backend serves public/ statically
var token=localStorage.getItem('dc_token')||'';
var user=null; try{user=JSON.parse(localStorage.getItem('dc_user')||'null');}catch(e){}
var lang=localStorage.getItem('dc_lang')||'bn';
var currentJob=null, currentJobId=null, draft={trade:'ELECTRICIAN',answers:{},skipped:[]};

/* ---------- i18n ---------- */
var I18N={
'nav.how':{bn:'কীভাবে কাজ করে',en:'How it works'},'nav.price':{bn:'খরচ',en:'Price'},'nav.why':{bn:'কেন',en:'Why'},'nav.faq':{bn:'প্রশ্ন',en:'FAQ'},'nav.app':{bn:'অ্যাপ',en:'App'},
'hero.kicker':{bn:'০১ — বাংলা-প্রথম কাজের রেকর্ড · AppLink · AppQuest 2.0',en:'01 — Bangla-first work record · AppLink · AppQuest 2.0'},
'hero.title':{bn:'ফোনে কাজ শুরু হয়। কাজের রেকর্ড লিখিত থাকুক।',en:'A phone call can start a job. Keep the work record in writing.'},
'hero.sub':{bn:'Electrician, painter, plumber — কাজের আগে দুই পক্ষ একসাথে লিখে নিন: কী কাজ, কত টাকা, কবে শেষ। দুজনেই OTP দিয়ে নিশ্চিত করলে রেকর্ড তৈরি হয়।',en:'Electrician, painter, plumber — before work starts, both sides write it down together: what work, how much, by when. The record is made only when both confirm by OTP.'},
'hero.cta1':{bn:'রেকর্ড শুরু করুন',en:'Start a record'},'hero.cta2':{bn:'ডেমো কাজ দেখুন',en:'See demo job'},
'hero.meta1':{bn:'Worker — DealCraft ফি নেই',en:'Workers — no DealCraft fee'},'hero.meta2':{bn:'Hirer — ৳১০ / রেকর্ড · ৳৭০ / মাস',en:'Hirer — ৳10 / record · ৳70 / month'},
'hero.map':{bn:'ঢাকা — চট্টগ্রাম · ডটেড ম্যাপ, লাইভ রুট',en:'Dhaka — Chattogram · dotted map, live route'},
'journey.title':{bn:'ফোন থেকে লিখিত রেকর্ড',en:'From a phone call to a written record'},
'j1t':{bn:'FairScope — আগে প্রশ্ন, পরে কাজ',en:'FairScope — questions first, work after'},'j1p':{bn:'কে মাল কিনবে, কয় কোট, কয় পয়েন্ট — প্রতিটি প্রশ্নের উত্তর ঠিক করুন। যা ঠিক হয়নি, তা লুকানো যাবে না।',en:'Who buys materials, how many coats, how many points — settle every question. What is undecided cannot be hidden.'},
'j1tag':{bn:'৮টি প্রশ্ন · ইলেকট্রিশিয়ান',en:'8 questions · electrician'},
'j2t':{bn:'দুজনেই নিশ্চিত করুন — OTP',en:'Both sides confirm — OTP'},'j2p':{bn:'Hirer আর worker — দুজনেই ফোনে OTP দিয়ে রেকর্ডটি নিশ্চিত করেন। একজনের কথায় রেকর্ড হয় না।',en:'Hirer and worker both confirm the record by OTP on their phones. One side alone cannot make a record.'},
'j2tag':{bn:'দুই পক্ষের সম্মতি',en:'Mutual confirmation'},
'j3t':{bn:'কাজ চলাকালীন — মাইলস্টোন আর ছবি',en:'During work — milestones and photos'},'j3p':{bn:'প্রতিটি ধাপ শেষ হলে worker ছবি দিয়ে জানান, hirer অনুমোদন দেন। সবকিছু সময়সহ লেখা থাকে।',en:'When a step finishes, the worker reports it with a photo and the hirer approves. Everything is kept with its time.'},
'j3tag':{bn:'টাইমলাইন · ছবি',en:'Timeline · photos'},
'j4t':{bn:'টাকা দিলে — PayProof',en:'When you pay — PayProof'},'j4p':{bn:'অগ্রিম বা কিস্তি দিলে রেকর্ড করুন। Worker “পেয়েছি” বললে তবেই টাকাটা স্বীকৃত হয়। বাকি টাকা সবসময় চোখের সামনে।',en:'Record an advance or instalment. It counts as acknowledged only when the worker says “Received”. The remaining amount stays visible.'},
'j4tag':{bn:'৳৫,০০০ অগ্রিম স্বীকৃত',en:'৳5,000 advance acknowledged'},
'j5t':{bn:'দাম বা সময় বদলাতে হলে — ChangeLock',en:'To change price or time — ChangeLock'},'j5p':{bn:'কাজ বেড়ে গেলে মুখে নয়, লিখিত প্রস্তাব। পুরনো দাম ৳১৮,০০০ → নতুন দাম ৳২০,০০০। Worker মানলে তবেই V2 হয়।',en:'If work grows, propose it in writing — not by word of mouth. Old price ৳18,000 → new price ৳20,000. It becomes V2 only if the worker accepts.'},
'j5tag':{bn:'+৳২,০০০ · প্রস্তাব, জোর নয়',en:'+৳2,000 · proposed, not forced'},
'j6t':{bn:'মত না মিললে — Dispute + ResolvePack',en:'If you disagree — Dispute + ResolvePack'},'j6p':{bn:'দুই পক্ষের বক্তব্য এক জায়গায়। সব রেকর্ড, ছবি, OTP — এক PDF-এ ডাউনলোড করুন।',en:'Both sides\u2019 statements in one place. Download every record, photo and OTP in one PDF.'},
'j6tag':{bn:'ResolvePack PDF',en:'ResolvePack PDF'},
'price.title':{bn:'সহজ খরচ। লুকানো কিছু নেই।',en:'Simple pricing. Nothing hidden.'},
'price.p1':{bn:'প্রতি রেকর্ড — যতটুকু ব্যবহার',en:'Per record — pay as you go'},'price.p1b':{bn:'একটি কাজের রেকর্ডের জন্য একবার। OTP দিয়ে যাচাই করলেই কার্যকর হয়।',en:'Once per job record. Active after OTP verification.'},
'price.p2':{bn:'প্রতি মাস — সীমাহীন রেকর্ড',en:'Per month — unlimited records'},'price.p2b':{bn:'মাসে যত খুশি রেকর্ড। যাঁরা নিয়মিত কাজ করান, তাঁদের জন্য।',en:'As many records as you like each month. For people who hire regularly.'},
'price.p3':{bn:'Worker — সবসময় ফ্রি',en:'Workers — free, always'},'price.p3b':{bn:'Worker-এর জন্য DealCraft সবসময় ফ্রি। তাঁদের কোনো চার্জ নেই।',en:'DealCraft is always free for workers. No charge for them.'},
'why.title':{bn:'কেন লিখিত রেকর্ড?',en:'Why a written record?'},
'w1t':{bn:'মুখের কথা ভুলে যায়, লেখা থাকে',en:'Spoken words are forgotten; writing stays'},'w1p':{bn:'“বলেছিলাম” আর “বলিনি” — এই তর্কে কাজ আটকে যায়। লিখিত রেকর্ডে দুই পক্ষের সম্মতি একসাথে থাকে।',en:'“I said it” versus “you didn\u2019t” stalls work. A written record holds both sides\u2019 agreement together.'},
'w2t':{bn:'ঠিক না হওয়া কথা আগেই চোখে পড়ে',en:'Undecided terms show up early'},'w2p':{bn:'FairScope যা ঠিক হয়নি, তা বড় করে দেখায়। কাজ শুরুর আগেই সিদ্ধান্ত নিন — মাঝপথে নয়।',en:'FairScope shows what is undecided in large print. Decide before work starts — not halfway through.'},
'w3t':{bn:'টাকার হিসাব সবসময় পরিষ্কার',en:'The money is always clear'},'w3p':{bn:'মোট কত, কত দেওয়া হয়েছে, কত বাকি — তিনটি সংখ্যা সবসময় একসাথে।',en:'Total, paid, remaining — three numbers, always together.'},
'w4t':{bn:'বদল হলে লিখিত প্রস্তাব',en:'Changes need a written proposal'},'w4p':{bn:'দাম বা সময় বদলাতে হলে ChangeLock প্রস্তাব লাগে। এক পক্ষ একা বদলাতে পারে না।',en:'Changing price or time needs a ChangeLock proposal. One side cannot change it alone.'},
'faq.title':{bn:'প্রশ্ন ও উত্তর',en:'Questions & answers'},
'f1q':{bn:'DealCraft কি টাকা রাখে?',en:'Does DealCraft hold money?'},'f1a':{bn:'না। DealCraft কোনো টাকা রাখে না, escrow করে না, পেমেন্টের নিশ্চয়তা দেয় না। শুধু টাকা দেওয়ার স্বীকৃতি লিখে রাখে।',en:'No. DealCraft holds no money, does no escrow, and gives no payment guarantee. It records payment acknowledgements only.'},
'f2q':{bn:'Worker-এর কি টাকা দিতে হয়?',en:'Does a worker have to pay?'},'f2a':{bn:'না। Worker-এর জন্য DealCraft সবসময় ফ্রি।',en:'No. DealCraft is always free for workers.'},
'f3q':{bn:'OTP না দিলে কী হবে?',en:'What if the OTP is not given?'},'f3a':{bn:'রেকর্ড তৈরি হবে না। দুই পক্ষের OTP নিশ্চিতকরণ ছাড়া কোনো রেকর্ড কার্যকর হয় না।',en:'No record is made. Without OTP confirmation from both sides, no record takes effect.'},
'f4q':{bn:'দাম বদলাতে চাইলে?',en:'What if I want to change the price?'},'f4a':{bn:'ChangeLock-এ লিখিত প্রস্তাব দিন। অপর পক্ষ মানলে নতুন দাম কার্যকর হয়, না মানলে পুরনো দামই থাকে।',en:'Send a written proposal in ChangeLock. The new price applies only if the other side accepts; otherwise the old price stands.'},
'f5q':{bn:'টাকা দিয়েছি — প্রমাণ কী?',en:'I paid — what is the proof?'},'f5a':{bn:'PayProof-এ টাকার রেকর্ড করুন। Worker “পেয়েছি” বললে তবেই সেটি স্বীকৃত হয়।',en:'Record it in PayProof. It counts as acknowledged only when the worker says “Received”.'},
'f6q':{bn:'মত না মিললে কী করব?',en:'What if we disagree?'},'f6a':{bn:'Dispute খুলুন — দুই পক্ষের বক্তব্য এক জায়গায় থাকবে। ResolvePack PDF ডাউনলোড করে রাখতে পারবেন।',en:'Open a dispute — both sides\u2019 statements stay in one place. You can download the ResolvePack PDF.'},
'f7q':{bn:'WorkPassport কী?',en:'What is WorkPassport?'},'f7a':{bn:'Worker-এর কাজের পরিচয়পত্র — কতটি কাজ শেষ হয়েছে, কোন ধরনের কাজ। টাকার অঙ্ক, ক্লায়েন্টের নাম আর ছবি worker না চাইলে দেখানো হয় না।',en:'A worker\u2019s work identity — how many jobs were completed, and what kind. Amounts, client names and photos stay hidden unless the worker enables them.'},
'f8q':{bn:'AppLink কি সবার ফোনে কাজ করে?',en:'Does AppLink work on every phone?'},'f8a':{bn:'না। AppLink শুধু Banglalink গ্রাহকদের কাছে পৌঁছায়। অন্য অপারেটরের ক্ষেত্রে SMS/OTP পৌঁছাবে না।',en:'No. AppLink reaches Banglalink subscribers only. SMS/OTP will not reach other operators.'},
'app.title':{bn:'অ্যাপ — রেকর্ড শুরু করুন',en:'App — start a record'},
'app.lede':{bn:'ফোন নম্বর দিয়ে লগইন করুন। OTP আসবে SMS-এ।',en:'Log in with your phone number. The OTP arrives by SMS.'},
'login.title':{bn:'লগইন — ফোন + OTP',en:'Log in — phone + OTP'},'login.sub':{bn:'Hirer হিসেবে লগইন করুন। Worker-দের জন্য আলাদা সহজ পাতা আছে — worker লিংক দিয়ে।',en:'Log in as a hirer. Workers have a separate simple page — through the worker link.'},
'login.phone':{bn:'ফোন নম্বর',en:'Phone number'},'login.name':{bn:'আপনার নাম (ঐচ্ছিক)',en:'Your name (optional)'},
'login.send':{bn:'OTP পাঠান',en:'Send OTP'},'login.otp':{bn:'OTP কোড',en:'OTP code'},'login.verify':{bn:'যাচাই করুন ও লগইন করুন',en:'Verify & log in'},'login.back':{bn:'ফিরে যান',en:'Back'},
'jobs.title':{bn:'আমার কাজ',en:'My jobs'},'jobs.logout':{bn:'লগ আউট',en:'Log out'},'jobs.new':{bn:'+ নতুন কাজ — FairScope',en:'+ New job — FairScope'},'jobs.refresh':{bn:'তালিকা আপডেট করুন',en:'Refresh list'},'jobs.empty':{bn:'এখনো কোনো কাজ নেই। উপরে নতুন রেকর্ড শুরু করুন।',en:'No jobs yet. Start a record above.'},
'new.title':{bn:'নতুন কাজ — FairScope',en:'New job — FairScope'},'new.trade':{bn:'কাজের ধরন — Trade',en:'Trade — type of work'},
'new.workerPhone':{bn:'Worker-এর ফোন',en:'Worker phone'},'new.workerName':{bn:'Worker-এর নাম',en:'Worker name'},
'new.next':{bn:'পরের ধাপ — FairScope প্রশ্ন',en:'Next — FairScope questions'},'new.next2':{bn:'পরের ধাপ — দাম ও তারিখ',en:'Next — price & dates'},'new.back':{bn:'ফিরে যান',en:'Back'},
'new.fsHint':{bn:'প্রতিটি প্রশ্নের উত্তর দিন। “ঠিক হয়নি” বেছে নিলে সেটি Missing-Term সতর্কতায় দেখাবে — লুকানো যাবে না।',en:'Answer every question. Choosing “Not decided” shows it in the Missing-Term warning — it cannot be hidden.'},
'new.price':{bn:'সম্মত দাম (৳)',en:'Agreed price (৳)'},'new.deadline':{bn:'শেষ তারিখ',en:'Deadline'},'new.scope':{bn:'কাজের বিবরণ — Scope',en:'Scope — work description'},
'new.milestones':{bn:'মাইলস্টোন — ধাপ (ঐচ্ছিক)',en:'Milestones — steps (optional)'},'new.addMs':{bn:'+ মাইলস্টোন যোগ করুন',en:'+ Add milestone'},'new.review':{bn:'রেকর্ড দেখুন',en:'Review record'},
'new.create':{bn:'কাজ তৈরি করুন ও worker-কে পাঠান',en:'Create job & send to worker'},
'warn.title':{bn:'Missing terms — ঠিক হয়নি',en:'Missing terms — not decided'},'warn.text':{bn:'নিচের বিষয়গুলো এখনো ঠিক হয়নি। প্রতিটি শর্তের উত্তর দিন, অথবা সেই শর্তটি আলাদাভাবে বাদ দিন — সব একসাথে বাদ দেওয়া যায় না।',en:'The items below are still undecided. Answer each one, or skip that one term explicitly — they are never skipped in bulk.'},
'warn.resolve':{bn:'এখনই ঠিক করুন',en:'Resolve now'},'warn.skip':{bn:'বাদ দিয়ে এগিয়ে যান',en:'Skip — continue anyway'},
'bal.agreed':{bn:'সম্মত দাম',en:'Agreed'},'bal.paid':{bn:'স্বীকৃত পেমেন্ট',en:'Acknowledged paid'},'bal.rem':{bn:'বাকি',en:'Remaining'},
'detail.back':{bn:'← সব কাজ',en:'← All jobs'},'detail.confirmTitle':{bn:'Hirer-এর নিশ্চিতকরণ দরকার',en:'Hirer confirmation needed'},
'detail.confirmText':{bn:'Worker নিশ্চিত করেছেন। আপনার OTP দিয়ে রেকর্ডটি চূড়ান্ত করুন।',en:'The worker has confirmed. Finalise the record with your OTP.'},
'detail.confirmBtn':{bn:'OTP দিয়ে নিশ্চিত করুন',en:'Confirm with OTP'},
'detail.sendOtp':{bn:'নিশ্চিতকরণের OTP পাঠান',en:'Send confirm OTP'},
'detail.force':{bn:'তবুও বন্ধ করুন — সব মাইলস্টোন এখনো অনুমোদিত হয়নি',en:'Close anyway — not all milestones are approved yet'},
'detail.waitTitle':{bn:'Worker-এর নিশ্চিতকরণের অপেক্ষায়',en:'Waiting for worker confirmation'},
'detail.waitText':{bn:'Worker এখনো নিশ্চিত করেননি। Worker তাঁর লিংক থেকে OTP দিয়ে নিশ্চিত করলে আপনি এখানে নিশ্চিত করতে পারবেন।',en:'The worker has not confirmed yet. Once the worker confirms by OTP from their link, you can confirm here.'},
'detail.workerLinkTitle':{bn:'Worker-এর লিংক',en:'Worker link'},
'detail.resendLink':{bn:'Worker-এর লিংক আবার পাঠান',en:'Resend worker link'},
'detail.resendOk':{bn:'Worker-এর লিংক আবার পাঠানো হয়েছে।',en:'Worker link resent.'},
'detail.photoKind':{bn:'ছবির ধরন',en:'Photo kind'},
'detail.photoBefore':{bn:'আগে — BEFORE',en:'BEFORE — before work'},
'detail.photoAfter':{bn:'পরে — AFTER',en:'AFTER — after work'},
'nav.menu':{bn:'মেনু',en:'Menu'},
'bill.statusTitle':{bn:'বিলিং অবস্থা',en:'Billing status'},
'bill.subActive':{bn:'সাবস্ক্রিপশন সক্রিয় — ৳৭০ / মাস',en:'Subscription active — ৳70 / month'},
'bill.subInactive':{bn:'কোনো সক্রিয় সাবস্ক্রিপশন নেই',en:'No active subscription'},
'bill.paidJobs':{bn:'পরিশোধিত কাজ',en:'Paid jobs'},
'bill.unpaidJobs':{bn:'অপরিশোধিত কাজ',en:'Unpaid jobs'},
'bill.statusUnknown':{bn:'বিলিং অবস্থা এখন দেখা যাচ্ছে না — পরে আবার চেষ্টা করুন।',en:'Billing status is unavailable right now — please try again later.'},
'detail.passport':{bn:'WorkPassport',en:'WorkPassport'},
'detail.passportText':{bn:'কাজ বন্ধ হওয়ার পর worker-এর WorkPassport-এ যোগ করুন। কী দেখানো হবে, তা বেছে নিন।',en:'After the job closes, add it to the worker\u2019s WorkPassport. Choose what is shown.'},
'detail.passportBtn':{bn:'WorkPassport-এ যোগ করুন',en:'Add to WorkPassport'},
'detail.photos':{bn:'ছবি',en:'Photos'},'detail.addPhoto':{bn:'ছবি যোগ করুন',en:'Add a photo'},'detail.upload':{bn:'ছবি আপলোড করুন',en:'Upload photo'},
'detail.close':{bn:'কাজ বন্ধ করুন',en:'Close job'},'detail.closeText':{bn:'কাজ শেষ হলে দুই পক্ষের সম্মতিতে বন্ধ করুন।',en:'When work is done, close it with both sides\u2019 agreement.'},
'detail.closeHow':{bn:'Worker তার পাতায় "কাজ শেষ" চাপলে একটি OTP কোড পান — সেই কোড এখানে লিখুন। কোড না থাকলে "একা বন্ধ করুন" বেছে নিন (রেকর্ডে Hirer-only লেখা থাকবে)।',en:'The worker taps "Confirm close" on their page and gets a code — enter it here. Without the code, choose "Close alone" (recorded as hirer-only).'},
'detail.closeOtp':{bn:'Worker-এর OTP কোড — Worker close code',en:'Worker close code'},
'detail.closeAnyway':{bn:'একা বন্ধ করুন — Worker-এর কোড ছাড়া (Hirer-only)',en:'Close alone — without the worker\u2019s code (hirer-only)'},
'detail.closeBtn':{bn:'কাজ বন্ধ করুন — সম্পূর্ণ হয়েছে নিশ্চিত করুন',en:'Close job — confirm completion'},'detail.pack':{bn:'ResolvePack ডাউনলোড (PDF)',en:'Download ResolvePack (PDF)'},
'tab.timeline':{bn:'টাইমলাইন',en:'Timeline'},'tab.change':{bn:'ChangeLock',en:'ChangeLock'},'tab.pay':{bn:'PayProof',en:'PayProof'},'tab.miles':{bn:'মাইলস্টোন',en:'Milestones'},'tab.dispute':{bn:'Dispute',en:'Dispute'},'tab.billing':{bn:'বিলিং',en:'Billing'},
'change.title':{bn:'পরিবর্তনের প্রস্তাব — ChangeLock',en:'Propose a change — ChangeLock'},
'change.text':{bn:'দাম বা সময় বদলাতে হলে লিখিত প্রস্তাব দিন। Worker মানলে তবেই নতুন সংস্করণ (V2) হয়।',en:'To change price or time, send a written proposal. It becomes a new version (V2) only if the worker accepts.'},
'change.delta':{bn:'দামের পরিবর্তন (৳, যেমন +2000 বা -1000)',en:'Price change (৳, e.g. +2000 or -1000)'},'change.deadline':{bn:'নতুন শেষ তারিখ (ঐচ্ছিক)',en:'New deadline (optional)'},'change.reason':{bn:'কারণ',en:'Reason'},'change.send':{bn:'Worker-কে প্রস্তাব পাঠান',en:'Send proposal to worker'},
'pay.title':{bn:'পেমেন্ট রেকর্ড — PayProof',en:'Record a payment — PayProof'},'pay.text':{bn:'টাকা দিলে এখানে লিখুন। Worker “Received” বললে তবেই স্বীকৃত হয়।',en:'Write it here when you pay. It counts as acknowledged only when the worker says “Received”.'},
'pay.amount':{bn:'টাকার পরিমাণ (৳)',en:'Amount (৳)'},'pay.method':{bn:'মাধ্যম',en:'Method'},'pay.date':{bn:'তারিখ',en:'Date'},'pay.record':{bn:'পেমেন্ট রেকর্ড করুন',en:'Record payment'},
'miles.title':{bn:'মাইলস্টোন',en:'Milestones'},
'dispute.title':{bn:'Dispute',en:'Dispute'},'dispute.cat':{bn:'বিভাগ',en:'Category'},'dispute.text':{bn:'আপনার বক্তব্য',en:'Your statement'},'dispute.open':{bn:'Dispute খুলুন',en:'Open dispute'},
'bill.title':{bn:'বিলিং',en:'Billing'},'bill.text':{bn:'একটি রেকর্ড ৳১০, অথবা মাসে ৳৭০-তে সীমাহীন। Worker-এর জন্য DealCraft ফি নেই।',en:'One record is ৳10, or ৳70/month for unlimited records. No DealCraft fee for workers.'},
'bill.caas':{bn:'এই রেকর্ডের জন্য ৳১০ দিন',en:'Pay ৳10 for this record'},'bill.sub':{bn:'সাবস্ক্রাইব করুন ৳৭০ / মাস',en:'Subscribe ৳70 / month'},
'foot.text':{bn:'অনানুষ্ঠানিক কাজের জন্য বাংলা-প্রথম কাজের রেকর্ড। DealCraft কোনো টাকা রাখে না, শুধু টাকা দেওয়ার স্বীকৃতি লিখে রাখে।',en:'Bangla-first work record for informal jobs. DealCraft holds no money, records payment acknowledgements only.'},
'loc.title':{bn:'লাইভ লোকেশন',en:'Live location'},
'loc.privacy':{bn:'Worker নিজে Share চাপলেই কেবল আপনি দেখতে পাবেন — শুধু কাজ চলাকালীন। কাজ বন্ধ হলে লোকেশন মুছে যায়।',en:'You can see it only if the worker taps Share — only while the job is active. Location is deleted when the job closes.'},
'loc.notSharing':{bn:'শেয়ার করছে না — Not sharing',en:'Not sharing'},
'loc.stopped':{bn:'শেয়ার বন্ধ — Sharing stopped',en:'Sharing stopped'},
'loc.enRoute':{bn:'আসছে — En route',en:'En route'},
'loc.arriving':{bn:'কাছে আসছে — Arriving',en:'Arriving'},
'loc.arrived':{bn:'পৌঁছেছে — Arrived on site',en:'Arrived on site'},
'loc.onSite':{bn:'কাজের জায়গায় আছে — On site',en:'On site'},
'loc.paused':{bn:'বিরতি — Paused',en:'Paused'},
'loc.away':{bn:'সরলরেখা দূরত্ব',en:'straight-line distance'},'loc.eta':{bn:'পৌঁছাতে',en:'ETA'},
'site.title':{bn:'কাজের জায়গা (ঐচ্ছিক)',en:'Job site (optional)'},
'site.hint':{bn:'ম্যাপে ট্যাপ করে পিন বসান, অথবা আপনার বর্তমান লোকেশন ব্যবহার করুন। জায়গা না দিলে দূরত্ব/ETA দেখাবে না — শেয়ারিং তবুও চলবে।',en:'Tap the map to drop a pin, or use your current location. Without a site there is no distance or ETA — sharing still works.'},
'site.address':{bn:'ঠিকানা',en:'Address'},
'site.me':{bn:'আমার বর্তমান লোকেশন ব্যবহার করুন',en:'Use my current location'},
'site.clear':{bn:'জায়গা মুছুন',en:'Clear site'},
'nav.bid':{bn:'মিস্ত্রি খুঁজুন',en:'Find a repairer'},
'bid.postBtn':{bn:'মিস্ত্রি খুঁজুন — ছবি দিয়ে কাজ দিন',en:'Find a repairer — post with a photo'},
'bid.findBtn':{bn:'কাজ খুঁজুন — দর দিন',en:'Find work — bid on jobs'},
'bid.back':{bn:'← সব কাজ',en:'← All jobs'},
'bid.postTitle':{bn:'মিস্ত্রি খুঁজুন — ছবি দিয়ে কাজ দিন',en:'Find a repairer — post a job with a photo'},
'bid.postText':{bn:'সমস্যার ছবি তুলুন, কাজের ধরন আর বিবরণ লিখুন। কাছের মিস্ত্রিরা দাম দেবেন — আপনি একজনকে বেছে নিলে তবেই রেকর্ড তৈরি হয়, দুই পক্ষের OTP দিয়ে। দর দিলেই চুক্তি হয় না।',en:'Take a photo of the problem, pick the trade, write a short description. Nearby repairers bid a price — a record is made only when you pick one and both sides confirm by OTP. A bid alone is not an agreement.'},
'bid.trade':{bn:'কাজের ধরন — Trade',en:'Trade — type of work'},
'bid.desc':{bn:'সমস্যাটা কী (সর্বোচ্চ ৫০০ অক্ষর)',en:'What is wrong? (max 500 characters)'},
'bid.photos':{bn:'সমস্যার ছবি (সর্বোচ্চ ৩টি)',en:'Photos of the problem (max 3)'},
'bid.address':{bn:'কাজের জায়গা',en:'Job site'},
'bid.me':{bn:'আমার বর্তমান লোকেশন ব্যবহার করুন',en:'Use my current location'},
'bid.clear':{bn:'জায়গা মুছুন',en:'Clear site'},
'bid.post':{bn:'দরের জন্য কাজ দিন',en:'Post job for bids'},
'bid.mine':{bn:'আমার দর-খোলা কাজ',en:'My open bid jobs'},
'bid.findTitle':{bn:'কাজ খুঁজুন — দর দিন',en:'Find work — bid on jobs'},
'bid.findText':{bn:'খোলা কাজগুলো দেখুন — কাছের কাজ আগে। দর দিলেই কাজ পাওয়া যায় না — Hirer বেছে নিলে রেকর্ড তৈরি হয়, দুই পক্ষের OTP দিয়ে।',en:'Browse open jobs — nearest first. A bid alone does not win the job — the hirer picks one, then a record is made and both sides confirm by OTP.'},
'bid.useLoc':{bn:'আমার লোকেশন ব্যবহার করুন — কাছের কাজ আগে',en:'Use my location — nearest first'},
'bid.refresh':{bn:'আপডেট করুন',en:'Refresh'},
'bid.acceptNote':{bn:'দর দিলেই চুক্তি হয় না — বেছে নিলে রেকর্ড তৈরি হয়, তারপর দুই পক্ষের OTP দিয়ে নিশ্চিত করতে হয়।',en:'A bid alone is not an agreement — picking one creates a record, which both sides must then confirm by OTP.'},
'bid.closeNoHire':{bn:'দর বন্ধ করুন — কাউকে বাছা হয়নি',en:'Close bidding — nobody picked'}
};
var NOT_DECIDED={bn:'ঠিক হয়নি',en:'Not decided'};
function t(key){var d=I18N[key];return d?(d[lang]||d.en):key;}
function applyI18n(){document.documentElement.lang=lang;
 document.querySelectorAll('[data-i18n]').forEach(function(el){var v=t(el.getAttribute('data-i18n'));if(v)el.textContent=v;});
 var b=document.getElementById('lang-bn'),e=document.getElementById('lang-en');
 if(b)b.setAttribute('aria-pressed',lang==='bn'?'true':'false');
 if(e)e.setAttribute('aria-pressed',lang==='en'?'true':'false');
 localStorage.setItem('dc_lang',lang);}
function setLang(l){lang=l;applyI18n();renderFairScope();if(currentJob)renderDetail(currentJob);}

/* ---------- dotted Bangladesh map ---------- */
/* Approximate border polygon as [lon,lat] pairs. */
var BD=[[88.05,26.55],[88.35,26.15],[88.15,25.6],[88.55,25.15],[88.9,24.55],[89.05,24.0],[89.25,23.4],[89.05,22.75],[89.35,22.25],[89.85,21.85],[90.35,22.15],[90.9,22.45],[91.45,22.75],[91.95,22.85],[92.35,22.4],[92.55,21.75],[92.65,21.15],[92.35,20.95],[92.55,21.6],[92.4,22.25],[92.25,22.85],[92.45,23.35],[92.2,23.9],[92.05,24.5],[91.75,24.95],[91.95,25.25],[91.4,25.15],[90.85,25.25],[90.35,25.45],[89.85,25.85],[89.35,26.05],[88.65,26.35]];
function inPoly(x,y,poly){var inside=false;for(var i=0,j=poly.length-1;i<poly.length;j=i++){var xi=poly[i][0],yi=poly[i][1],xj=poly[j][0],yj=poly[j][1];if(((yi>y)!==(yj>y))&&(x<(xj-xi)*(y-yi)/(yj-yi)+xi))inside=!inside;}return inside;}
function project(lon,lat,W,H){return [((lon-88.0)/(92.8-88.0))*W, H-((lat-20.9)/(26.7-20.9))*H];}
function renderDotMap(el,opts){
 if(!el)return; opts=opts||{}; var W=opts.w||560,H=opts.h||620,step=opts.step||17;
 var svg='<svg viewBox="0 0 '+W+' '+H+'" role="img" aria-label="Dotted map of Bangladesh">';
 var dhaka=project(90.41,23.81,W,H), ctg=project(91.83,22.36,W,H);
 for(var y=step/2;y<H;y+=step){for(var x=step/2;x<W;x+=step){
   var lon=88.0+(x/W)*(92.8-88.0), lat=20.9+((H-y)/H)*(26.7-20.9);
   if(!inPoly(lon,lat,BD))continue;
   var dD=Math.hypot(x-dhaka[0],y-dhaka[1]), dC=Math.hypot(x-ctg[0],y-ctg[1]);
   var fill='#ffffff', r=2.6, op=0.85;
   if(dD<14||dC<14){fill='#FF5A1F';r=4;op=1;}
   else if(dD<40||dC<40){op=0.55;}
   svg+='<circle cx="'+x.toFixed(1)+'" cy="'+y.toFixed(1)+'" r="'+r+'" fill="'+fill+'" opacity="'+op+'"/>';
 }}
 /* orange arc Dhaka -> Chattogram */
 var mx=(dhaka[0]+ctg[0])/2, my=Math.min(dhaka[1],ctg[1])-70;
 svg+='<path d="M '+dhaka[0].toFixed(1)+' '+dhaka[1].toFixed(1)+' Q '+mx.toFixed(1)+' '+my.toFixed(1)+' '+ctg[0].toFixed(1)+' '+ctg[1].toFixed(1)+'" fill="none" stroke="#FF5A1F" stroke-width="2" stroke-dasharray="1 7" stroke-linecap="round"/>';
 svg+='<circle cx="'+dhaka[0]+'" cy="'+dhaka[1]+'" r="7" fill="none" stroke="#FF5A1F" stroke-width="2"/>';
 svg+='<circle cx="'+ctg[0]+'" cy="'+ctg[1]+'" r="7" fill="none" stroke="#FF5A1F" stroke-width="2"/>';
 /* tiny stars */
 [[120,90],[430,140],[300,520],[470,430]].forEach(function(p){svg+='<text x="'+p[0]+'" y="'+p[1]+'" fill="#fff" font-size="13" opacity="0.8">+</text>';});
 svg+='<text x="'+(dhaka[0]+14)+'" y="'+(dhaka[1]-10)+'" fill="#fff" font-size="12" font-family="monospace" letter-spacing="2">DHAKA</text>';
 svg+='<text x="'+(ctg[0]-72)+'" y="'+(ctg[1]+26)+'" fill="#fff" font-size="12" font-family="monospace" letter-spacing="2">CHATTOGRAM</text>';
 svg+='</svg>'; el.innerHTML=svg;
}

/* ---------- scroll journey ---------- */
function initJourney(){
 var sec=document.getElementById('journey-steps'); if(!sec)return;
 var steps=sec.querySelectorAll('.jstep');
 function onScroll(){
  var r=sec.getBoundingClientRect(), total=r.height-window.innerHeight*0.6;
  var p=total>0?Math.min(1,Math.max(0,-r.top/total)):1;
  var pct=Math.round(p*100);
  var ring=document.getElementById('ring-fg'), rp=document.getElementById('ring-pct'), pl=document.getElementById('journey-pct-label'), jl=document.getElementById('journey-label');
  if(ring)ring.setAttribute('stroke-dashoffset',(163.4*(1-p)).toFixed(1));
  if(rp)rp.textContent=pct+'%'; if(pl)pl.textContent='SCROLL — '+pct+'%';
  if(jl)jl.textContent=pct<70?'V1 — ৳18,000 · AGREED':'V2 — ৳20,000 · CHANGELOCK';
  steps.forEach(function(s,i){s.classList.toggle('active', p*(steps.length)>i);});
  /* P1: the journey card follows the same scroll state. */
  var activeCount=0; steps.forEach(function(s){if(s.classList.contains('active'))activeCount++;});
  setJourneyState(Math.max(0,Math.min(5,activeCount-1)));
 }
 window.addEventListener('scroll',onScroll,{passive:true}); onScroll();
}

/* ---------- helpers ---------- */
function $(id){return document.getElementById(id);}
function showErr(msg){var e=$('app-error');if(!e)return;e.hidden=false;e.textContent=msg;clearNotice();}
function clearErr(){var e=$('app-error');if(e){e.hidden=true;e.textContent='';}}
/* Neutral info/success notice (blue) — info must never use the red error box. */
function showNotice(msg){var e=$('app-notice');if(!e)return;e.hidden=false;e.textContent=msg;clearErr();}
function clearNotice(){var e=$('app-notice');if(e){e.hidden=true;e.textContent='';}}
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function taka(n){if(n==null||n==='')return '—';return '৳'+Number(n).toLocaleString('en-IN');}
function fmtDate(d){if(!d)return '—';try{return new Date(d).toLocaleDateString(lang==='bn'?'bn-BD':'en-GB',{day:'numeric',month:'short',year:'numeric'});}catch(e){return String(d);}}
function fmtDT(d){if(!d)return '—';try{return new Date(d).toLocaleString(lang==='bn'?'bn-BD':'en-GB',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});}catch(e){return String(d);}}
async function api(path,opts){
 opts=opts||{}; opts.headers=opts.headers||{};
 if(!(opts.body instanceof FormData))opts.headers['Content-Type']='application/json';
 if(token)opts.headers['Authorization']='Bearer '+token;
 var res, data=null;
 try{res=await fetch(API+path,opts);}catch(e){throw new Error((lang==='bn'?'নেটওয়ার্ক সমস্যা — সার্ভারে পৌঁছানো যায়নি। ':'Network problem — could not reach the server. ')+e.message);}
 try{data=await res.json();}catch(e){data=null;}
 if(!res.ok){var m=(data&&(data.error||data.message))||('HTTP '+res.status);throw new Error(m);}
 return data;
}
function showView(id){['view-login','view-jobs','view-new','view-detail','view-bid-post','view-find-work','view-bid-detail'].forEach(function(v){var el=$(v);if(el)el.hidden=(v!==id);});
 /* P4: 200ms fade + 8px slide on view switch (CSS .view-enter). */
 var show=$(id); if(show){show.classList.remove('view-enter');void show.offsetWidth;show.classList.add('view-enter');}
 /* P2: detail sheet sits on a very light grey section background. */
 var appSec=$('app'); if(appSec)appSec.classList.toggle('app-grey',id==='view-detail');}

/* ---------- motion helpers (P0–P4; transform/opacity only) ---------- */
var RM=(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches)||false;
function tweenNum(el,from,to,dur,fmt){
 if(!el)return;
 /* innerHTML, not textContent: the price count-up's fmt returns the
    "<small>৳</small>" prefix as HTML — textContent printed the tags as
    literal text ("<small>৳</small>10") once the count-up ran. All fmt
    outputs here are numbers plus that one static tag, never user input. */
 if(RM||from===to){el.innerHTML=fmt(to);return;}
 var start=null;
 function step(now){if(start===null)start=now;var p=Math.min(1,(now-start)/dur);var e=1-Math.pow(1-p,3);
  el.innerHTML=fmt(Math.round(from+(to-from)*e));
  if(p<1)requestAnimationFrame(step);}
 requestAnimationFrame(step);
}
function showSuccessCheck(){
 var box=$('success-check'); if(!box)return;
 box.innerHTML='<svg viewBox="0 0 52 52" aria-hidden="true"><circle cx="26" cy="26" r="25"/><path d="M14 27l8 8 16-16"/></svg>';
 box.hidden=false;
 setTimeout(function(){box.hidden=true;box.innerHTML='';},1500);
}
/* P0: hero card tilt — pointer follows with lagged tilt (max ±6° extra),
   transform only, rAF-throttled. Touch devices get the slow idle float. */
function initHeroTilt(){
 var scene=$('hero-scene'), tilt=$('hero-tilt'); if(!scene||!tilt)return;
 if(RM)return;
 if(window.matchMedia('(pointer: fine)').matches){
  var tx=0,ty=0,cx=0,cy=0,raf=null;
  document.querySelector('.hero').addEventListener('pointermove',function(ev){
   var r=scene.getBoundingClientRect();
   tx=Math.max(-6,Math.min(6,((ev.clientX-(r.left+r.width/2))/r.width)*12));
   ty=Math.max(-6,Math.min(6,((ev.clientY-(r.top+r.height/2))/r.height)*12));
   if(!raf)raf=requestAnimationFrame(function loop(){
    cx+=(tx-cx)*0.12; cy+=(ty-cy)*0.12;
    tilt.style.transform='rotateY('+(-8+cx).toFixed(2)+'deg) rotateX('+(4-cy).toFixed(2)+'deg)';
    if(Math.abs(tx-cx)>0.05||Math.abs(ty-cy)>0.05)raf=requestAnimationFrame(loop);else raf=null;
   });
  });
  scene.addEventListener('pointerleave',function(){tx=0;ty=0;});
 }else{
  tilt.classList.add('idle-float');
 }
}
/* P1: journey card state machine — driven by the existing scroll logic. */
var journeyState=-1;
function setJourneyState(s){
 if(s===journeyState)return;
 var card=$('journey-card'); if(!card)return;
 var prev=journeyState; journeyState=s; card.setAttribute('data-state',String(s));
 var agreed=s>=4?20000:18000, paid=s>=3?5000:0, rem=agreed-paid;
 $('jc-ver').textContent=s>=4?'V2 · BOTH SIDES CONFIRMED':'V1 · AGREED';
 $('jc-agreed').textContent=taka(agreed);
 $('jc-rem').textContent=taka(rem);
 tweenNum($('jc-paid'),prev>=3?5000:0,paid,500,taka);
 $('jc-bar').style.width=(s>=3?25:0)+'%';
 var otp=$('jc-otp'); otp.hidden=s<1;
 if(s===1){otp.classList.remove('stamp');void otp.offsetWidth;otp.classList.add('stamp');}
 $('jc-photo').hidden=s<2;
 $('jc-change').hidden=s<4;
 $('jc-pack').hidden=s<5;
 $('jc-ghost').hidden=s<4;
 if(s===4&&prev===3){card.classList.remove('flipping');void card.offsetWidth;card.classList.add('flipping');}
}
/* P4: price numerals count up + comparison bars, once, when in view. */
function initPriceMotion(){
 var stats=document.querySelectorAll('.stat-num[data-count]');
 if(!('IntersectionObserver' in window)||RM){
  /* Reduced motion / no observer: final values are already in the HTML. */
  document.querySelectorAll('.pb-fill').forEach(function(f){f.style.width=f.getAttribute('data-w')+'%';});
  return;
 }
 var obs=new IntersectionObserver(function(entries){
  entries.forEach(function(en){
   if(!en.isIntersecting)return;
   var el=en.target; obs.unobserve(el);
   if(el.classList.contains('stat-num')){
    var target=+el.getAttribute('data-count'), small=el.querySelector('small');
    tweenNum(el,0,target,700,function(n){return (small?small.outerHTML:'')+n.toLocaleString('en-IN');});
   }else if(el.classList.contains('price-bars')){
    el.querySelectorAll('.pb-fill').forEach(function(f){f.style.width=f.getAttribute('data-w')+'%';});
   }
  });
 },{threshold:0.4});
 stats.forEach(function(el){obs.observe(el);});
 var bars=$('price-bars'); if(bars)obs.observe(bars);
}
/* P2: photo lightbox (fade + slight zoom, CSS) + BEFORE/AFTER compare. */
function initLightbox(){
 var lb=$('lightbox'), img=$('lightbox-img'); if(!lb)return;
 function close(){lb.classList.remove('open');setTimeout(function(){lb.hidden=true;},250);}
 $('lightbox-close').addEventListener('click',close);
 lb.addEventListener('click',function(ev){if(ev.target===lb)close();});
 document.addEventListener('keydown',function(ev){if(ev.key==='Escape'&&!lb.hidden)close();});
 document.addEventListener('click',function(ev){
  var t=ev.target.closest?ev.target.closest('[data-lightbox]'):null;
  if(!t)return;
  img.src=t.getAttribute('data-lightbox'); img.alt=t.getAttribute('data-alt')||'Job photo';
  lb.hidden=false; requestAnimationFrame(function(){lb.classList.add('open');});
 });
}
/* Compare slider: drag or keyboard range input moves the split. */
function initCompare(el){
 var range=el.querySelector('input[type="range"]'); if(!range)return;
 function set(v){el.style.setProperty('--pos',v+'%');}
 range.addEventListener('input',function(){set(range.value);});
 el.addEventListener('pointerdown',function(ev){
  var r=el.getBoundingClientRect();
  function move(e){var p=Math.max(2,Math.min(98,((e.clientX-r.left)/r.width)*100));set(p);range.value=Math.round(p);}
  move(ev);
  function up(){window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',up);}
  window.addEventListener('pointermove',move);window.addEventListener('pointerup',up);
 });
}

/* ---------- FairScope ---------- */
var FAIRSCOPE={
 ELECTRICIAN:[
  {q:{bn:'কে তার/মালামাল কিনবে?',en:'Who buys wires/materials?'},opts:{bn:['Hirer কিনবে','Worker কিনবে','দুজনে ভাগ করে'],en:['Hirer buys','Worker buys','Shared']}},
  {q:{bn:'তারের ব্র্যান্ড ও স্পেসিফিকেশন',en:'Wire brand and specification'},opts:{bn:['BRB / BBS','পলি কেবল','অন্য ব্র্যান্ড'],en:['BRB / BBS','Poly Cable','Other brand']}},
  {q:{bn:'পয়েন্টের সংখ্যা',en:'Number of points'},opts:{bn:['৫-এর কম','৫–১০','১০-এর বেশি'],en:['Under 5','5–10','Over 10']}},
  {q:{bn:'সার্কিট ব্রেকার কি অন্তর্ভুক্ত?',en:'Circuit breakers included?'},opts:{bn:['হ্যাঁ','না','আংশিক'],en:['Yes','No','Partly']}},
  {q:{bn:'দেয়াল কাটা ও মেরামত কি অন্তর্ভুক্ত?',en:'Wall cutting and wall repair — included?'},opts:{bn:['হ্যাঁ','না','শুধু কাটা'],en:['Yes','No','Cutting only']}},
  {q:{bn:'চূড়ান্ত টেস্টিং কি অন্তর্ভুক্ত?',en:'Final testing included?'},opts:{bn:['হ্যাঁ','না'],en:['Yes','No']}},
  {q:{bn:'পরিবহন খরচ',en:'Transport cost'},opts:{bn:['Hirer দেবে','Worker দেবে','দামে অন্তর্ভুক্ত'],en:['Hirer pays','Worker pays','Included in price']}},
  {q:{bn:'বর্জ্য অপসারণ',en:'Waste removal'},opts:{bn:['Worker করবে','Hirer করবে'],en:['Worker does it','Hirer does it']}}],
 PAINTER:[
  {q:{bn:'এলাকা / রুম',en:'Area / rooms'},opts:{bn:['১ রুম','২–৩ রুম','পুরো ফ্ল্যাট'],en:['1 room','2–3 rooms','Whole flat']}},
  {q:{bn:'কোটের সংখ্যা',en:'Number of coats'},opts:{bn:['১ কোট','২ কোট','৩ কোট'],en:['1 coat','2 coats','3 coats']}},
  {q:{bn:'প্রাইমার কি অন্তর্ভুক্ত?',en:'Primer included?'},opts:{bn:['হ্যাঁ','না'],en:['Yes','No']}},
  {q:{bn:'রঙের ব্র্যান্ড',en:'Paint brand'},opts:{bn:['Asian Paints','Berger','অন্য ব্র্যান্ড'],en:['Asian Paints','Berger','Other brand']}},
  {q:{bn:'সারফেস প্রস্তুতি',en:'Surface preparation'},opts:{bn:['পুট্টি + ঘষা','শুধু ঘষা','কিছুই না'],en:['Putty + sanding','Sanding only','None']}},
  {q:{bn:'আসবাব সরানো',en:'Furniture moving'},opts:{bn:['Worker করবে','Hirer করবে'],en:['Worker does it','Hirer does it']}},
  {q:{bn:'পরিষ্কার',en:'Cleanup'},opts:{bn:['Worker করবে','Hirer করবে'],en:['Worker does it','Hirer does it']}}],
 PLUMBER:[
  {q:{bn:'পাইপের উপাদান',en:'Pipe material'},opts:{bn:['CPVC','UPVC','GI'],en:['CPVC','UPVC','GI']}},
  {q:{bn:'ফিটিংস — Hirer দেবে নাকি Worker?',en:'Fixtures included or supplied by hirer'},opts:{bn:['Hirer দেবে','Worker দেবে','দামে অন্তর্ভুক্ত'],en:['Hirer supplies','Worker supplies','Included in price']}},
  {q:{bn:'দেয়াল ভাঙা ও মেরামত',en:'Wall breaking and restoration'},opts:{bn:['হ্যাঁ','না','শুধু ভাঙা'],en:['Yes','No','Breaking only']}},
  {q:{bn:'লিক টেস্টিং',en:'Leak testing'},opts:{bn:['হ্যাঁ','না'],en:['Yes','No']}},
  {q:{bn:'মালামালের দায়িত্ব',en:'Materials responsibility'},opts:{bn:['Hirer','Worker','ভাগ করে'],en:['Hirer','Worker','Shared']}}]
};
/* Answers are stored in ENGLISH: the backend counts exactly 'Not decided' as a
   missing term and keys answers by the English question text. The UI shows the
   localised label; the stored value is always the English option. */
function missingTerms(){
 var qs=FAIRSCOPE[draft.trade]||[];
 return qs.filter(function(q,i){return draft.answers[i]==='Not decided'||draft.answers[i]==null;}).map(function(q){return q.q.en;});
}
function renderFairScope(){
 var box=$('fs-questions'); if(!box)return;
 var qs=FAIRSCOPE[draft.trade]||[];
 box.innerHTML=qs.map(function(q,i){
  var optsEn=q.opts.en, optsLoc=q.opts[lang]||q.opts.en;
  var btns=optsEn.map(function(o,oi){var sel=draft.answers[i]===o;return '<button type="button" data-q="'+i+'" data-v="'+esc(o)+'" aria-pressed="'+sel+'">'+esc(optsLoc[oi])+'</button>';}).join('');
  var nd=draft.answers[i]==='Not decided';
  btns+='<button type="button" data-q="'+i+'" data-v="Not decided" aria-pressed="'+nd+'">'+esc(NOT_DECIDED[lang])+'</button>';
  return '<div class="q-block"><div class="q">'+esc(q.q[lang]||q.q.en)+'</div><div class="opt-row">'+btns+'</div></div>';
 }).join('');
 box.querySelectorAll('button').forEach(function(b){b.addEventListener('click',function(){
  var qi=+b.getAttribute('data-q');
  /* P4: resolving a missing term ticks + strikes it before the box
     collapses — the term was unresolved, now it has an answer. */
  var wasMissing=draft.answers[qi]==null||draft.answers[qi]==='Not decided';
  var qEn=(FAIRSCOPE[draft.trade]||[])[qi];
  function apply(){
   draft.answers[qi]=b.getAttribute('data-v');
   if(qEn) draft.skipped=draft.skipped.filter(function(s){return s!==qEn.q.en;});
   renderFairScope(); updateMissingWarn();
  }
  if(wasMissing&&qEn&&!RM){
   var li=document.querySelector('#missing-list li span')&&Array.prototype.slice.call(document.querySelectorAll('#missing-list li')).filter(function(li){return li.textContent.indexOf(qEn.q.en)>=0;})[0];
   if(li){li.classList.add('resolved');setTimeout(apply,320);return;}
  }
  apply(); });});
 updateMissingWarn();
}
/* Three states, never bulk auto-skip: a missing term is UNRESOLVED until
   the hirer answers it or taps "Skip this term" on that one term. The
   server refuses creation while any term is unresolved. */
function updateMissingWarn(){
 var miss=missingTerms(); var w=$('missing-warn'); if(!w)return;
 /* P4: one soft pulse when the warning first appears — never looping. */
 var wasHidden=w.hidden;
 w.hidden=miss.length===0;
 if(wasHidden&&miss.length&&!RM){w.classList.remove('pulse-once');void w.offsetWidth;w.classList.add('pulse-once');}
 var ul=$('missing-list');
 if(ul)ul.innerHTML=miss.map(function(m){
  var skipped=draft.skipped.indexOf(m)>=0;
  return '<li><span>'+esc(m)+'</span> '+(skipped
   ?'<span class="pill pill-orange">'+(lang==='bn'?'বাদ দেওয়া — Skipped':'Skipped — explicit')+'</span>'
   :'<button type="button" class="btn btn-dark-ghost btn-sm" data-skip-term="'+esc(m)+'">'+(lang==='bn'?'এই শর্তটি বাদ দিন':'Skip this term')+'</button>')+'</li>';
 }).join('');
 if(ul)ul.querySelectorAll('[data-skip-term]').forEach(function(b){b.addEventListener('click',function(){
  var term=b.getAttribute('data-skip-term');
  if(draft.skipped.indexOf(term)<0) draft.skipped.push(term);
  updateMissingWarn();
 });});
}
function newStep(n){
 var cur=0; [1,2,3,4].forEach(function(i){var el=$('new-step-'+i);if(el&&!el.hidden)cur=i;});
 [1,2,3,4].forEach(function(i){var el=$('new-step-'+i);if(el){el.hidden=(i!==n);
  /* P4: wizard steps slide horizontally in the direction of travel. */
  if(i===n&&!RM){el.classList.remove('new-step-fwd','new-step-back');void el.offsetWidth;el.classList.add(n>=cur?'new-step-fwd':'new-step-back');}}});
 var stepsEl=$('new-steps'); if(stepsEl)stepsEl.style.setProperty('--step',n);
 var steps=document.querySelectorAll('#new-steps span'); steps.forEach(function(s){s.classList.toggle('on',+s.getAttribute('data-step')===n);});
}

/* ---------- job site picker (Leaflet, tap to drop a pin) ---------- */
var siteMap=null, siteMarker=null;
function setSite(lat,lng,silent){
 draft.site={lat:+lat.toFixed(6),lng:+lng.toFixed(6),address:($('site-address')||{}).value?$('site-address').value.trim():''};
 if(siteMap){if(siteMarker)siteMarker.setLatLng([lat,lng]);else siteMarker=L.marker([lat,lng]).addTo(siteMap);if(!silent)siteMap.setView([lat,lng],15);}
 var p=$('site-picked'); if(p){p.hidden=false;p.textContent='SITE: '+draft.site.lat+', '+draft.site.lng+(draft.site.address?' · '+draft.site.address:'');}
}
function initSiteMap(){
 var el=$('site-map'); if(!el||siteMap)return;
 if(typeof L==='undefined'){el.innerHTML='<p class="small">Map did not load — you can still type the address. / ম্যাপ লোড হয়নি — ঠিকানা লিখুন।</p>';return;}
 siteMap=L.map(el).setView([23.8103,90.4125],12);
 L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap contributors'}).addTo(siteMap);
 siteMap.on('click',function(e){setSite(e.latlng.lat,e.latlng.lng);});
 if(draft.site)setSite(draft.site.lat,draft.site.lng,true);
 setTimeout(function(){siteMap.invalidateSize();},100);
}

/* ---------- live location (hirer side) ---------- */
var locTimer=null, locMap=null, locMarker=null, locSiteMarker=null, locTrailLine=null, locRouteLine=null, locLastPos=null, locAnim=null, locWasSharing=false;
var LOC_STATUS={'not-sharing':'loc.notSharing','stopped':'loc.stopped','en-route':'loc.enRoute','arriving':'loc.arriving','arrived':'loc.arrived','on-site':'loc.onSite','paused':'loc.paused'};
function locStopAll(){if(locTimer){clearInterval(locTimer);locTimer=null;}if(locAnim){cancelAnimationFrame(locAnim);locAnim=null;}}
function locInitMap(view){
 var el=$('loc-map'); if(!el)return false;
 if(typeof L==='undefined'){$('loc-nomap').hidden=false;return false;}
 $('loc-nomap').hidden=true; el.hidden=false;
 if(!locMap){
  var c=view.site?[view.site.lat,view.site.lng]:[view.latest.lat,view.latest.lng];
  locMap=L.map(el).setView(c,14);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap contributors'}).addTo(locMap);
  locMarker=L.marker(c,{icon:L.divIcon({className:'loc-dot',html:'<span class="loc-dot-in"></span>',iconSize:[18,18],iconAnchor:[9,9]})}).addTo(locMap);
  if(view.site)locSiteMarker=L.marker([view.site.lat,view.site.lng]).addTo(locMap).bindPopup(view.site.address||'Job site');
  locTrailLine=L.polyline([],{color:'#FF5A1F',weight:3}).addTo(locMap);
  locRouteLine=L.polyline([],{color:'#0E76FF',weight:2,dashArray:'6 6'}).addTo(locMap);
  setTimeout(function(){locMap.invalidateSize();},100);
 }
 return true;
}
function locAnimateTo(lat,lng){
 var from=locLastPos||{lat:lat,lng:lng};
 var start=performance.now(), dur=8000;
 if(locAnim)cancelAnimationFrame(locAnim);
 var step=function(now){
  var p=Math.min(1,(now-start)/dur);
  var la=from.lat+(lat-from.lat)*p, lo=from.lng+(lng-from.lng)*p;
  if(locMarker)locMarker.setLatLng([la,lo]);
  if(p<1)locAnim=requestAnimationFrame(step); else locAnim=null;
 };
 locAnim=requestAnimationFrame(step);
 locLastPos={lat:lat,lng:lng};
}
function locRender(view){
 var box=$('loc-box'); if(!box)return; box.hidden=false;
 var pill=$('loc-status-pill'); pill.textContent=t(LOC_STATUS[view.status]||'loc.notSharing');
 var txt=[];
 if(view.distanceKm!=null)txt.push(t('loc.away')+': '+view.distanceKm+' km');
 if(view.etaMinutes!=null)txt.push(t('loc.eta')+': ~'+view.etaMinutes+' min');
 if(view.latest&&view.latest.updated_at)txt.push(new Date(view.latest.updated_at).toLocaleTimeString(lang==='bn'?'bn-BD':'en-GB',{hour:'2-digit',minute:'2-digit'}));
 $('loc-text').textContent=txt.join(' · ')||'—';
 /* latest is null until the worker shares anything — the server now
    answers 200 'not-sharing' instead of 404, so guard the null here or
    the render throws on the very first poll of an ACTIVE job. */
 if(view.latest&&locInitMap(view)){
  locAnimateTo(view.latest.lat,view.latest.lng);
  if(view.site&&locSiteMarker)locSiteMarker.setLatLng([view.site.lat,view.site.lng]);
  if(locTrailLine)locTrailLine.setLatLngs((view.trail||[]).map(function(p){return [p.lat,p.lng];}));
  if(locRouteLine&&view.site)locRouteLine.setLatLngs([[view.latest.lat,view.latest.lng],[view.site.lat,view.site.lng]]);
 }
}
async function locPoll(){
 if(!currentJobId)return;
 try{var v=await api('/api/jobs/'+encodeURIComponent(currentJobId)+'/location');
  /* Only a real share counts: the 200 'not-sharing' answer must not flip
     this, or a later 404 would read as 'Sharing stopped'. */
  locWasSharing=!!v.sharing; locRender(v);
 }catch(e){
  var pill=$('loc-status-pill');
  if(pill)pill.textContent=t(locWasSharing?'loc.stopped':'loc.notSharing');
  var tx=$('loc-text'); if(tx)tx.textContent='—';
 }
}
function locStartPolling(){
 locStopAll(); locWasSharing=false; locLastPos=null;
 if(!currentJob||currentJob.status!=='ACTIVE'){var b=$('loc-box');if(b)b.hidden=true;return;}
 $('loc-box').hidden=false; locPoll(); locTimer=setInterval(locPoll,10000);
}

/* ---------- auth ---------- */
var loginPhone='';
function initAuth(){
 var f=$('form-login');
 if(f)f.addEventListener('submit',async function(ev){ev.preventDefault();clearErr();
  loginPhone=$('login-phone').value.trim(); var name=$('login-name').value.trim();
  if(!loginPhone){showErr(lang==='bn'?'ফোন নম্বর দিন।':'Enter a phone number.');return;}
  try{var r=await api('/api/auth/request-otp',{method:'POST',body:JSON.stringify({phone:loginPhone,name:name||undefined,role:'hirer'})});
   $('form-login').hidden=true; $('form-otp').hidden=false;
   if(r&&r.sandbox&&r.sandbox.otp){$('otp-note').hidden=false;$('otp-note-text').textContent=(lang==='bn'?'আপনার কোড: ':'Your code: ')+(r.sandbox.otp||'—');}
   $('otp-code').focus();
  }catch(e){showErr((lang==='bn'?'OTP পাঠানো যায়নি: ':'Could not send OTP: ')+e.message);}
 });
 var fo=$('form-otp');
 if(fo)fo.addEventListener('submit',async function(ev){ev.preventDefault();clearErr();
  var code=$('otp-code').value.trim();
  try{var r=await api('/api/auth/verify-otp',{method:'POST',body:JSON.stringify({phone:loginPhone,code:code})});
   if(r&&r.token){token=r.token;localStorage.setItem('dc_token',token);}
   if(r&&r.user){user=r.user;localStorage.setItem('dc_user',JSON.stringify(user));}
   showView('view-jobs'); loadJobs();
   var pend=null; try{pend=localStorage.getItem('dc_pending_demo');localStorage.removeItem('dc_pending_demo');}catch(e){}
   if(pend)openJob(pend);
  }catch(e){showErr((lang==='bn'?'যাচাই হয়নি: ':'Verification failed: ')+e.message);}
 });
 var back=$('otp-back'); if(back)back.addEventListener('click',function(){$('form-otp').hidden=true;$('form-login').hidden=false;});
 var lo=$('btn-logout'); if(lo)lo.addEventListener('click',function(){token='';user=null;localStorage.removeItem('dc_token');localStorage.removeItem('dc_user');showView('view-login');$('form-login').hidden=false;$('form-otp').hidden=true;});
}

/* ---------- jobs ---------- */
/* API rows use snake_case (worker_name, worker_phone, current_version). */
function pick(o,names){for(var i=0;i<names.length;i++){if(o&&o[names[i]]!=null&&o[names[i]]!=='')return o[names[i]];}return '';}
function jobTitle(j){var trade=j.trade||j.scope||'JOB';var w=pick(j,['workerName','worker_name'])||pick(j,['workerPhone','worker_phone']);return (trade+' — '+w).toUpperCase();}
function jobPhone(j){return pick(j,['workerPhone','worker_phone']);}
function jobVersion(j,full){var vs=(full&&full.versions)||j.versions||[];return j.current_version||j.version||j.currentVersion||(vs.length||1);}
async function loadJobs(){
 clearErr(); var list=$('job-list'); if(!list)return; list.innerHTML='<p class="mono grey">LOADING…</p>';
 try{var r=await api('/api/jobs'); var jobs=Array.isArray(r)?r:(r.jobs||r.data||[]);
  $('me-line').textContent=user?((user.name||'')+' · '+(user.phone||'')):'';
  $('jobs-empty').hidden=jobs.length>0;
  list.innerHTML=jobs.map(function(j){
   var id=j.id||j._id; var ver='V'+(j.current_version||j.version||j.currentVersion||1);
   var status=j.status||j.state||'DRAFT';
   /* List rows carry no price/deadline from the API — show only what exists. */
   var meta=[ver,esc(status),esc(jobPhone(j))].filter(Boolean).join(' · ');
   return '<div class="job-row"><div><div class="t">'+esc(jobTitle(j))+'</div><div class="m">'+meta+'</div></div><div style="display:flex;gap:8px;align-items:center"><span class="pill '+(status==='CONFIRMED'||status==='ACTIVE'?'pill-blue':status==='COMPLETED'||status==='CLOSED'?'pill-orange':'pill-grey')+'">'+esc(status)+'</span><button class="btn btn-dark btn-sm" type="button" data-open="'+esc(id)+'">'+(lang==='bn'?'খুলুন':'Open')+'</button></div></div>';
  }).join('')||'';
  list.querySelectorAll('[data-open]').forEach(function(b){b.addEventListener('click',function(){openJob(b.getAttribute('data-open'));});});
 }catch(e){list.innerHTML='';showErr((lang==='bn'?'কাজের তালিকা আনা যায়নি: ':'Could not load jobs: ')+e.message);}
}
async function openJob(id){
 clearErr(); currentJobId=id;
 try{var r=await api('/api/jobs/'+encodeURIComponent(id));
  currentJob=r.job||r; currentJob._full=r;
  renderDetail(currentJob); showView('view-detail'); locStartPolling();
  try{localStorage.setItem('dc_job_'+id,JSON.stringify(r));}catch(e){}
 }catch(e){showErr((lang==='bn'?'কাজটি খোলা যায়নি: ':'Could not open job: ')+e.message);
  try{var cached=JSON.parse(localStorage.getItem('dc_job_'+id)||'null');if(cached){currentJob=cached.job||cached;renderDetail(currentJob);showView('view-detail');}}catch(_e){}}
}
/* Light refresh of the open job's data — re-renders the detail tabs without
   touching location polling or a live share (openJob would stop
   both via locStartPolling/locStopAll). Without this, the timeline and the
   dispute list show only the events from when the job was opened: a
   worker's statement, a payment ack or a geofence arrival never appears
   until the hirer leaves and re-opens the job. Form inputs are static HTML
   outside the re-rendered lists, so drafts survive the refresh. */
async function refreshJob(){if(!currentJobId)return;
 try{var r=await api('/api/jobs/'+encodeURIComponent(currentJobId));
  currentJob=r.job||r; currentJob._full=r; renderDetail(currentJob);}catch(e){}}
function latestVersion(job,full){
 var vs=(full&&full.versions)||job.versions||[];
 if(!vs.length)return null;
 return vs[vs.length-1];
}
function eventDetail(ev){
 try{var p=typeof ev.payload_json==='string'?JSON.parse(ev.payload_json||'{}'):(ev.payload||ev.detail||{});
  var bits=[];
  if(p.price!=null)bits.push(taka(p.price));
  if(p.priceDelta!=null)bits.push('Δ '+taka(p.priceDelta));
  if(p.deadline)bits.push(fmtDate(p.deadline));
  if(p.reason)bits.push(p.reason);
  if(p.missingTerms&&p.missingTerms.length)bits.push((lang==='bn'?'ঠিক হয়নি: ':'Not decided: ')+p.missingTerms.join(', '));
  if(p.changeId)bits.push('#'+String(p.changeId).slice(0,8));
  if(p.amount!=null)bits.push(taka(p.amount));
  if(p.note)bits.push(p.note);
  return bits.join(' · ');
 }catch(e){return '';}
}
function renderDetail(job){
 var full=job._full||{}; var versions=full.versions||job.versions||[]; var events=full.events||job.events||[];
 var pays=full.payments||job.payments||[]; var miles=full.milestones||job.milestones||[];
 var bal=full.balance||job.balance||{}; var disputes=full.disputes||job.disputes||[];
 var lv=latestVersion(job,full);
 var price=job.price!=null?job.price:(lv?lv.price:null);
 var deadline=job.deadline||(lv?lv.deadline:null);
 var ver='V'+(job.current_version||job.version||job.currentVersion||(versions.length||1));
 $('detail-title').textContent=jobTitle(job);
 $('detail-meta').textContent=ver+' · '+taka(price)+' · '+(deadline?fmtDate(deadline):'—')+' · '+jobPhone(job);
 var pills=''; if(job.status)pills+='<span class="pill pill-blue">'+esc(job.status)+'</span>';
 if(job.workerLink)pills+='<span class="pill">WORKER LINK: '+esc(job.workerLink)+'</span>';
 var miss=job.missingTerms||(lv&&lv.scope?lv.scope.skippedTerms:[])||[];
 if(miss.length)pills+='<span class="pill pill-orange">MISSING: '+miss.length+'</span>';
 $('detail-pills').innerHTML=pills;
 /* one-page record from the latest version */
 var rec=$('detail-record');
 if(rec&&lv&&lv.scope){var sc=lv.scope;
  rec.hidden=false;
  rec.innerHTML='<h3>'+esc(job.trade||'')+' — '+(lang==='bn'?'এক পাতার কাজের রেকর্ড':'One-page work record')+' ('+ver+')</h3><table>'+
   '<tr><th>'+(lang==='bn'?'বিবরণ':'Scope')+'</th><td>'+esc(sc.scope||'—')+'</td></tr>'+
   Object.keys(sc.answers||{}).map(function(k){return '<tr><th>'+esc(k)+'</th><td>'+esc(sc.answers[k])+'</td></tr>';}).join('')+
   '</table>';
 } else if(rec){rec.hidden=true;}
 var agreed=bal.agreed!=null?bal.agreed:price||0, paid=bal.acknowledgedPaid!=null?bal.acknowledgedPaid:0, rem=bal.remaining!=null?bal.remaining:(agreed-paid);
 /* P2: balance numbers count/tween to new values instead of snapping. */
 var prev=renderDetail._prevBal||{agreed:0,paid:0,rem:0};
 tweenNum($('bal-agreed'),prev.agreed,agreed,500,taka);
 tweenNum($('bal-paid'),prev.paid,paid,500,taka);
 tweenNum($('bal-rem'),prev.rem,rem,500,taka);
 renderDetail._prevBal={agreed:agreed,paid:paid,rem:rem};
 $('bar-paid').style.width=agreed?Math.min(100,paid/agreed*100)+'%':'0%';
 $('bar-agreed').style.width='0%';
 var dw=$('detail-warn'); if(dw){dw.hidden=!miss.length;var ul=$('detail-missing');if(ul)ul.innerHTML=miss.map(function(m){return '<li>'+esc(typeof m==='string'?m:(m.question||m.name||JSON.stringify(m)))+'</li>';}).join('');}
 /* Hirer confirm box: show ONLY once the worker has actually confirmed
    (a CONFIRMED_BY_WORKER event) and the hirer has not yet confirmed
    (no CONFIRMED_BY_HIRER event). Never show it on PENDING alone, and
    never check invented statuses. Before the worker confirms, show a
    neutral waiting note instead. */
 var evTypes=events.map(function(ev){return ev.type||ev.event||ev.label||'';});
 var workerConfirmed=evTypes.indexOf('CONFIRMED_BY_WORKER')>=0;
 var hirerConfirmed=evTypes.indexOf('CONFIRMED_BY_HIRER')>=0;
 var dc=$('detail-confirm'); if(dc)dc.hidden=!(workerConfirmed&&!hirerConfirmed);
 var dwait=$('detail-wait'); if(dwait)dwait.hidden=workerConfirmed||hirerConfirmed;
 /* Worker link: shown whenever the job carries one (the
    server returns workerLink on the job detail). */
 var wl=$('worker-link-box');
 if(wl){var link=job.workerLink||job.worker_link||'';
  wl.hidden=!link;
  var wlu=$('worker-link-url'); if(wlu&&link){wlu.textContent=link;wlu.href=link;}
 }
 /* timeline — events are {type, actor, payload_json, created_at} */
 var tl=$('timeline-list');
 tl.innerHTML=events.length?events.map(function(ev){
  var label=ev.label||ev.type||ev.title||ev.event||''; var when=ev.createdAt||ev.created_at||ev.at||ev.date||'';
  var det=eventDetail(ev)||(ev.note||ev.detail||'');
  /* P2: coloured node dots per event type (payment=orange, change=blue,
     confirmation=green). */
  var t=(ev.type||ev.event||'');
  var cls=/PAYMENT/.test(t)?'tl-pay':/CHANGE/.test(t)?'tl-change':/CONFIRM/.test(t)?'tl-confirm':'';
  return '<li class="'+cls+'"><div class="when">'+esc(when?fmtDate(when):'')+' · '+esc(ev.actor||'')+'</div><div><b>'+esc(String(label).replace(/_/g,' '))+'</b></div>'+(det?'<div class="small">'+esc(det)+'</div>':'')+'</li>';
 }).join(''):'<li><div class="small">'+(lang==='bn'?'এখনো কোনো ঘটনা নেই।':'No events yet.')+'</div></li>';
 /* P2: staggered fade-up on first view (transform/opacity only). */
 tl.querySelectorAll('li').forEach(function(li,i){
  if(RM){li.classList.add('in');return;}
  li.style.transitionDelay=(Math.min(i,8)*60)+'ms';
  if('IntersectionObserver' in window){
   var o=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){li.classList.add('in');o.disconnect();}});},{threshold:0.2});
   o.observe(li);
  }else li.classList.add('in');
 });
 /* photos — rows are {id, job_id, milestone, url, kind, taken_at}.
    Rendered as thumbnails with a BEFORE/AFTER kind badge (no badge when
    kind is null, e.g. old photos) and the timestamp. BEFORE/AFTER photos
    of the same milestone become one drag comparison slider (P2); tapping
    any photo opens the lightbox. */
 var ph=$('photo-list');
 if(ph){var photos=full.photos||job.photos||[];
  if(!photos.length){ph.innerHTML='—';}
  else{
   /* group by milestone; a pair (BEFORE+AFTER) renders as a slider */
   var groups={}; photos.forEach(function(p){var k=(p&&p.milestone!=null)?String(p.milestone):'__none__';(groups[k]=groups[k]||[]).push(p);});
   ph.innerHTML='<div class="photo-grid">'+Object.keys(groups).map(function(k){
    var g=groups[k];
    var before=g.filter(function(p){return p&&p.kind==='BEFORE';})[0];
    var after=g.filter(function(p){return p&&p.kind==='AFTER';})[0];
    if(before&&after){
     var bu=before.url||before.path||'', au=after.url||after.path||'';
     return '<figure class="cmp" style="grid-column:1/-1"><img src="'+esc(bu)+'" alt="'+(lang==='bn'?'আগের ছবি':'Before photo')+'" loading="lazy"><div class="cmp-after"><img src="'+esc(au)+'" alt="'+(lang==='bn'?'পরের ছবি':'After photo')+'" loading="lazy"></div><span class="cmp-tag before">BEFORE</span><span class="cmp-tag after">AFTER</span><span class="cmp-handle" aria-hidden="true"></span><button type="button" class="cmp-expand" data-lightbox="'+esc(au)+'" data-alt="'+(lang==='bn'?'পরের ছবি':'After photo')+'" aria-label="'+(lang==='bn'?'ছবি বড় করে দেখুন':'Enlarge photo')+'">⤢</button><input type="range" min="2" max="98" value="50" aria-label="Before / after comparison slider"></figure>';
    }
    return g.map(function(p){
     var u=typeof p==='string'?p:(p.url||p.path||''); if(!u)return '';
     var kind=(p&&p.kind)||null;
     var when=(p&&(p.taken_at||p.takenAt||p.created_at||p.createdAt))||'';
     return '<figure class="photo"><img src="'+esc(u)+'" data-lightbox="'+esc(u)+'" data-alt="'+(lang==='bn'?'কাজের ছবি':'Job photo')+'" alt="'+(lang==='bn'?'কাজের ছবি':'Job photo')+'" loading="lazy">'+
      (kind?'<span class="pill '+(kind==='BEFORE'?'pill-blue':'pill-orange')+'">'+esc(kind)+'</span>':'')+
      (when?'<figcaption class="mono grey">'+esc(fmtDT(when))+'</figcaption>':'')+'</figure>';
    }).join('');
   }).join('')+'</div>';
   ph.querySelectorAll('.cmp').forEach(initCompare);
  }
 }
 /* ChangeLock journey — the clearest visual in the app: V1 -> proposed
    change -> mutual approval -> V2, as a connected strip, then the rows. */
 var cl=$('change-list');
 var journey='';
 if(versions.length){
  var changeEvs=events.filter(function(ev){return ev.type==='CHANGE_PROPOSED'||ev.type==='CHANGE_APPROVED'||ev.type==='CHANGE_REJECTED'||ev.type==='CHANGE_CLARIFIED';});
  journey='<div class="cl-journey" role="list" aria-label="ChangeLock journey">'+versions.map(function(v,i){
   var vn=v.version_no||v.version||(i+1);
   var approved=changeEvs.some(function(ev){var p={};try{p=JSON.parse(ev.payload_json||'{}');}catch(e){}return ev.type==='CHANGE_APPROVED'&&p.version===vn;});
   var proposed=changeEvs.some(function(ev){return ev.type==='CHANGE_PROPOSED';});
   return '<div class="cl-step" role="listitem"><div class="cl-ver">V'+vn+'</div><div class="cl-price">'+taka(v.price)+'</div><div class="mono grey">'+(v.deadline?fmtDate(v.deadline):'—')+'</div><div class="mono">'+(i===0?'AGREED':approved?'BOTH SIDES CONFIRMED':proposed?'PROPOSED':'—')+'</div></div>'+(i<versions.length-1?'<div class="cl-arrow" aria-hidden="true">→</div>':'');
  }).join('')+'</div>';
 }
 cl.innerHTML=(journey||'')+(versions.length?versions.map(function(v){
  return '<div class="notice"><b>V'+(v.version_no||v.version||'?')+' — '+taka(v.price)+'</b><div class="mono grey">'+(v.deadline?fmtDate(v.deadline):'—')+' · '+(v.fingerprint?('FP '+String(v.fingerprint).slice(0,12)+'…'):'')+'</div>'+(v.scope&&v.scope.scope?'<p>'+esc(v.scope.scope)+'</p>':'')+'</div>';
 }).join(''):'<p class="small">'+(lang==='bn'?'কোনো সংস্করণ নেই।':'No versions yet.')+'</p>');
 /* payments — rows use ack_status: AWAITING / ACKNOWLEDGED / DISPUTED */
 var pl=$('pay-list');
 pl.innerHTML=pays.length?pays.map(function(p){
  var ack=p.ack_status==='ACKNOWLEDGED';
  return '<div class="job-row"><div><div class="t">'+taka(p.amount)+'</div><div class="m">'+esc(p.method||'')+' · '+fmtDate(p.date||p.createdAt||p.created_at)+' · '+esc(p.ack_status||'AWAITING')+'</div></div><span class="pill '+(ack?'pill-blue':'pill-orange')+'">'+(ack?'ACK':'PENDING')+'</span></div>';
 }).join(''):'<p class="small">'+(lang==='bn'?'কোনো পেমেন্ট রেকর্ড নেই।':'No payments recorded yet.')+'</p>';
 /* milestones — Complete is a worker action (worker page); hirer only approves */
 var ml=$('miles-list');
 ml.innerHTML=miles.length?miles.map(function(m,i){
  var done=m.completed||m.status==='COMPLETE'||m.status==='COMPLETED';
  var appr=m.approved||m.status==='APPROVED';
  return '<div class="job-row"><div><div class="t">'+esc(m.title||('Milestone '+(i+1)))+'</div><div class="m">'+taka(m.amount)+' · '+(appr?'APPROVED':done?'COMPLETE — AWAITING APPROVAL':'PENDING')+'</div></div><div style="display:flex;gap:8px"><button class="btn btn-dark btn-sm" type="button" data-ms-approve="'+i+'" '+(appr?'disabled':'')+'>'+(lang==='bn'?'অনুমোদন':'Approve')+'</button></div></div>';
 }).join(''):'<p class="small">'+(lang==='bn'?'কোনো মাইলস্টোন নেই।':'No milestones.')+'</p>';
 ml.querySelectorAll('[data-ms-approve]').forEach(function(b){b.addEventListener('click',async function(){try{await api('/api/jobs/'+encodeURIComponent(currentJobId)+'/milestones/'+b.getAttribute('data-ms-approve')+'/approve',{method:'POST',body:'{}'});openJob(currentJobId);}catch(e){showErr(e.message);}});});
 /* disputes — statement text lives in d.statements[] */
 var dl=$('dispute-list');
 dl.innerHTML=disputes.length?disputes.map(function(d){
  var stmts=(d.statements||[]).map(function(s){return '<div class="small"><b>'+esc(s.side||'')+':</b> '+esc(s.text||'')+'</div>';}).join('');
  /* Mutual resolution: the hirer PROPOSES how it is resolved; the worker
     accepts or rejects it on the worker page. The job returns to ACTIVE
     only after the worker accepts — DealCraft never decides. */
  var did=d.id||d.disputeId||'';
  var proposed=events.some(function(ev){return ev.type==='RESOLUTION_PROPOSED';});
  var accepted=events.some(function(ev){return ev.type==='RESOLUTION_ACCEPTED';});
  var res=(d.status||'OPEN')==='OPEN'
   ?'<div class="btn-row" style="margin-top:10px"><button class="btn btn-dark btn-sm" type="button" data-dis-propose="'+esc(did)+'">'+(lang==='bn'?'সমাধানের প্রস্তাব দিন':'Propose a resolution')+'</button></div>'
    +'<div data-dis-form="'+esc(did)+'" hidden style="margin-top:10px"><label>'+(lang==='bn'?'কীভাবে মিটমাট হবে?':'How should this be resolved?')+'</label><textarea rows="2" data-dis-text="'+esc(did)+'" placeholder="'+(lang==='bn'?'যেমন: ওই রুমটা বিনা মূল্যে আবার রং করে দেবে':'e.g. repaint that room free of charge')+'"></textarea><div class="btn-row"><button class="btn btn-dark btn-sm" type="button" data-dis-send="'+esc(did)+'">'+(lang==='bn'?'প্রস্তাব পাঠান':'Send proposal')+'</button></div></div>'
    +'<p class="small">'+(accepted
      ?(lang==='bn'?'Worker প্রস্তাবটি মেনে নিয়েছে — সমাধান হয়েছে।':'The worker accepted the proposal — resolved.')
      :proposed
      ?(lang==='bn'?'প্রস্তাব পাঠানো হয়েছে — worker মানলে তবেই সমাধান হবে।':'Proposal sent — it resolves only if the worker accepts it.')
      :(lang==='bn'?'দুই পক্ষের বক্তব্য থাকলেই প্রস্তাব দেওয়া যায়। Worker মানলে তবেই সমাধান হবে — DealCraft কোনো রায় দেয় না।':'Both sides must have a statement first. It resolves only if the worker accepts — DealCraft never decides.'))+'</p>':'';
  return '<div class="notice"><b>'+esc(d.category||'Dispute')+'</b><div class="mono grey">'+esc(d.status||'OPEN')+'</div>'+stmts+res+'</div>';
 }).join(''):'<p class="small">'+(lang==='bn'?'কোনো dispute নেই।':'No disputes.')+'</p>';
 dl.querySelectorAll('[data-dis-propose]').forEach(function(b){b.addEventListener('click',function(){
  var did=b.getAttribute('data-dis-propose');
  var f=dl.querySelector('[data-dis-form="'+did+'"]'); if(f)f.hidden=false;});});
 dl.querySelectorAll('[data-dis-send]').forEach(function(b){b.addEventListener('click',async function(){clearErr();
  var did=b.getAttribute('data-dis-send');
  var ta=dl.querySelector('[data-dis-text="'+did+'"]');
  try{await api('/api/disputes/'+encodeURIComponent(did)+'/resolve-proposal',{method:'POST',body:JSON.stringify({proposal:ta?ta.value.trim():''})});openJob(currentJobId);}
  catch(e){showErr(e.message);}});});
 loadBillingStatus();
}

/* ---------- billing status ---------- */
async function loadBillingStatus(){
 var box=$('billing-status'); if(!box)return;
 var fees='<p class="mono">৳10 / '+(lang==='bn'?'রেকর্ড':'record')+' · ৳70 / '+(lang==='bn'?'মাস':'month')+'</p>';
 try{var d=await api('/api/billing/status');
  /* Response shape is not fixed yet — read it tolerantly, never invent a status. */
  var sub=d.subscription||d.sub||{};
  var active=sub.active===true||sub.status==='ACTIVE'||d.subscribed===true||d.activeSubscription===true||d.subscriptionActive===true;
  var paid=d.paidJobs!=null?d.paidJobs:(d.jobs&&d.jobs.paid!=null?d.jobs.paid:(d.paid!=null?d.paid:'—'));
  var unpaid=d.unpaidJobs!=null?d.unpaidJobs:(d.jobs&&d.jobs.unpaid!=null?d.jobs.unpaid:(d.unpaid!=null?d.unpaid:'—'));
  box.hidden=false;
  box.innerHTML='<b>'+esc(t('bill.statusTitle'))+'</b>'+fees+
   '<p>'+esc(active?t('bill.subActive'):t('bill.subInactive'))+'</p>'+
   '<p class="mono">'+esc(t('bill.paidJobs'))+': '+esc(paid)+' · '+esc(t('bill.unpaidJobs'))+': '+esc(unpaid)+'</p>';
 }catch(e){
  /* Endpoint may not exist yet (404) — show the known fees and say the
     live status is unavailable, instead of inventing subscription state. */
  box.hidden=false;
  box.innerHTML='<b>'+esc(t('bill.statusTitle'))+'</b>'+fees+'<p>'+esc(t('bill.statusUnknown'))+'</p>';
 }
}

/* ---------- new job ---------- */
function initNewJob(){
 var picker=$('trade-picker');
 if(picker)picker.querySelectorAll('button').forEach(function(b){b.addEventListener('click',function(){
  draft.trade=b.getAttribute('data-trade'); draft.answers={}; draft.skipped=[];
  picker.querySelectorAll('button').forEach(function(x){x.setAttribute('aria-pressed',x===b?'true':'false');});
  renderFairScope(); });});
 $('to-step-2').addEventListener('click',function(){
  if(!$('worker-phone').value.trim()){showErr(lang==='bn'?'Worker-এর ফোন নম্বর দিন।':'Enter the worker phone number.');return;}
  clearErr(); renderFairScope(); newStep(2); });
 $('back-step-1').addEventListener('click',function(){newStep(1);});
 $('warn-resolve').addEventListener('click',function(){$('missing-warn').scrollIntoView({behavior:'smooth',block:'center'});});
 $('to-step-3').addEventListener('click',function(){newStep(3);initSiteMap();});
 $('btn-site-me').addEventListener('click',function(){
  if(!('geolocation' in navigator)){showErr(lang==='bn'?'এই ডিভাইসে লোকেশন পাওয়া যাচ্ছে না।':'Location is not available on this device.');return;}
  navigator.geolocation.getCurrentPosition(function(p){setSite(p.coords.latitude,p.coords.longitude);},
   function(e){showErr(e.message);},{enableHighAccuracy:true,timeout:10000});});
 $('btn-site-clear').addEventListener('click',function(){draft.site=null;if(siteMarker){siteMap.removeLayer(siteMarker);siteMarker=null;}var p=$('site-picked');if(p)p.hidden=true;$('site-address').value='';});
 $('back-step-2').addEventListener('click',function(){newStep(2);});
 $('add-milestone').addEventListener('click',function(){
  var d=document.createElement('div'); d.className='field-grid';
  d.innerHTML='<div><input type="text" class="ms-title" placeholder="Milestone title"></div><div><input type="number" class="ms-amount" min="0" inputmode="numeric" placeholder="Amount ৳"></div>';
  $('milestone-rows').appendChild(d); });
 $('to-step-4').addEventListener('click',function(){
  var qs=FAIRSCOPE[draft.trade]||[];
  var answers={}; qs.forEach(function(q,i){answers[q.q.en]=draft.answers[i]||'Not decided';});
  var miles=[]; document.querySelectorAll('#milestone-rows .field-grid').forEach(function(r){
   var ti=r.querySelector('.ms-title').value.trim(), am=r.querySelector('.ms-amount').value;
   if(ti)miles.push({title:ti,amount:am?Number(am):0}); });
  if(!(Number($('job-price').value)>0)){showErr(lang==='bn'?'দাম ০-এর বেশি হতে হবে।':'Price must be more than 0.');return;}
  clearErr();
  draft.payload={trade:draft.trade,workerPhone:$('worker-phone').value.trim(),workerName:$('worker-name').value.trim(),
   scope:$('job-scope').value.trim(),price:Number($('job-price').value)||0,deadline:$('job-deadline').value,
   milestones:miles,answers:answers,skippedTerms:draft.skipped.slice(),
   site:draft.site?{lat:draft.site.lat,lng:draft.site.lng,address:$('site-address').value.trim()||draft.site.address||''}:undefined};
  var miss=missingTerms();
  $('review-record').innerHTML='<h3>'+esc(draft.trade)+' — '+(lang==='bn'?'এক পাতার কাজের রেকর্ড':'One-page work record')+'</h3><table>'+
   '<tr><th>'+(lang==='bn'?'Worker':'Worker')+'</th><td>'+esc(draft.payload.workerName||'')+' · '+esc(draft.payload.workerPhone)+'</td></tr>'+
   '<tr><th>'+(lang==='bn'?'দাম':'Price')+'</th><td>'+taka(draft.payload.price)+'</td></tr>'+
   '<tr><th>'+(lang==='bn'?'শেষ তারিখ':'Deadline')+'</th><td>'+esc(draft.payload.deadline||'—')+'</td></tr>'+
   '<tr><th>'+(lang==='bn'?'বিবরণ':'Scope')+'</th><td>'+esc(draft.payload.scope||'—')+'</td></tr>'+
   qs.map(function(q,i){var v=draft.answers[i]||'Not decided';
    var disp=v==='Not decided'?NOT_DECIDED[lang]:(function(){var ix=q.opts.en.indexOf(v);return ix>=0?(q.opts[lang]||q.opts.en)[ix]:v;})();
    return '<tr><th>'+esc(q.q[lang]||q.q.en)+'</th><td>'+esc(disp)+'</td></tr>';}).join('')+
   (miss.length?'<tr><th>'+(lang==='bn'?'ঠিক হয়নি':'Not decided')+'</th><td style="color:#c23c00">'+miss.map(function(m){var qq=qs.filter(function(x){return x.q.en===m;})[0];return esc(qq?(qq.q[lang]||qq.q.en):m);}).join(', ')+'</td></tr>':'')+
   (draft.skipped.length?'<tr><th>'+(lang==='bn'?'বাদ দেওয়া (ইচ্ছাকৃত)':'Explicitly skipped')+'</th><td>'+draft.skipped.map(function(m){var qq=qs.filter(function(x){return x.q.en===m;})[0];return esc(qq?(qq.q[lang]||qq.q.en):m);}).join(', ')+'</td></tr>':'')+
   '</table>';
  newStep(4); });
 $('back-step-3').addEventListener('click',function(){newStep(3);});
 $('btn-create-job').addEventListener('click',async function(){
  clearErr();
  try{var r=await api('/api/jobs',{method:'POST',body:JSON.stringify(draft.payload)});
   var job=r.job||r; var id=job.id||job._id;
   /* Worker link: ALWAYS shown after creation, in a neutral notice box. */
   var link=r.workerLink||job.workerLink||job.worker_link||'';
   if(link){var cb=$('create-link-box');if(cb){cb.hidden=false;var u=$('create-link-url');if(u){u.textContent=link;u.href=link;}}}
   if(r.missingTerms&&r.missingTerms.length){/* shown on detail */}
   if(id){openJob(id);}else{showView('view-jobs');loadJobs();}
  }catch(e){showErr((lang==='bn'?'কাজ তৈরি হয়নি: ':'Could not create job: ')+e.message);}
 });
 $('btn-new-job').addEventListener('click',function(){draft={trade:'ELECTRICIAN',answers:{},skipped:[]};renderFairScope();newStep(1);showView('view-new');});
 $('btn-refresh').addEventListener('click',loadJobs);
 $('btn-back-jobs').addEventListener('click',function(){locStopAll();showView('view-jobs');loadJobs();});
}

/* ---------- detail actions ---------- */
function initDetail(){
 document.querySelectorAll('.tabs button').forEach(function(b){b.addEventListener('click',function(){
  document.querySelectorAll('.tabs button').forEach(function(x){x.setAttribute('aria-selected',x===b?'true':'false');});
  document.querySelectorAll('.tabpanel').forEach(function(p){p.hidden=(p.id!=='tab-'+b.getAttribute('data-tab'));});
  if(b.getAttribute('data-tab')==='billing')loadBillingStatus();
  refreshJob(); });});
 $('btn-hirer-confirm').addEventListener('click',async function(){clearErr();
  try{await api('/api/jobs/'+encodeURIComponent(currentJobId)+'/hirer-confirm',{method:'POST',body:JSON.stringify({otpCode:$('confirm-otp').value.trim()})});showSuccessCheck();openJob(currentJobId);}
  catch(e){showErr(e.message);}});
 async function resendWorkerLink(){clearErr();clearNotice();
  /* POST /api/jobs/:id/worker-link — server endpoint may not exist yet;
     a 404 is reported, not hidden. */
  try{var r=await api('/api/jobs/'+encodeURIComponent(currentJobId)+'/worker-link',{method:'POST',body:'{}'});
   var link=(r&&(r.workerLink||r.worker_link||(r.job&&(r.job.workerLink||r.job.worker_link))))||'';
   if(link){if(currentJob)currentJob.workerLink=link;
    var wlu=$('worker-link-url');if(wlu){wlu.textContent=link;wlu.href=link;}
    var clu=$('create-link-url');if(clu){clu.textContent=link;clu.href=link;}}
   showNotice(t('detail.resendOk'));}
  catch(e){showErr((lang==='bn'?'লিংক আবার পাঠানো যায়নি: ':'Could not resend link: ')+e.message);}}
 var rs=$('btn-resend-link'); if(rs)rs.addEventListener('click',resendWorkerLink);
 var rsc=$('btn-resend-link-create'); if(rsc)rsc.addEventListener('click',resendWorkerLink);
 $('btn-confirm-send-otp').addEventListener('click',async function(){clearErr();
  /* hirer-confirm verifies purpose 'hirer-confirm' — request that OTP explicitly */
  try{var r=await api('/api/auth/request-otp',{method:'POST',body:JSON.stringify({phone:(user&&user.phone)||'',purpose:'hirer-confirm'})});
   if(r&&r.sandbox&&r.sandbox.otp){$('confirm-note').hidden=false;$('confirm-note-text').textContent=(lang==='bn'?'আপনার কোড: ':'Your code: ')+(r.sandbox.otp||'—');}
   $('confirm-otp').focus();
  }catch(e){showErr(e.message);}});
 $('form-change').addEventListener('submit',async function(ev){ev.preventDefault();clearErr();
  try{var r=await api('/api/jobs/'+encodeURIComponent(currentJobId)+'/changes',{method:'POST',body:JSON.stringify({priceDelta:Number($('ch-delta').value)||0,deadline:$('ch-deadline').value||undefined,reason:$('ch-reason').value.trim(),details:$('ch-reason').value.trim()})});
   /* Insert the notice AFTER the re-render: openJob rebuilds #change-list,
      so inserting before it wipes the notice instantly and the hirer never
      sees that the proposal was sent. */
   await openJob(currentJobId);
   if(r&&r.notifyLink){clearErr();var n=$('change-list');if(n)n.insertAdjacentHTML('afterbegin','<div class="notice blue"><b>Proposal sent.</b><p class="mono">WORKER LINK: '+esc(r.notifyLink)+'</p></div>');}}
  catch(e){showErr(e.message);}});
 $('form-pay').addEventListener('submit',async function(ev){ev.preventDefault();clearErr();
  try{await api('/api/jobs/'+encodeURIComponent(currentJobId)+'/payments',{method:'POST',body:JSON.stringify({amount:Number($('pay-amount').value),method:$('pay-method').value,date:$('pay-date').value||undefined})});showSuccessCheck();openJob(currentJobId);}
  catch(e){showErr(e.message);}});
 $('form-photo').addEventListener('submit',async function(ev){ev.preventDefault();clearErr();
  var f=$('photo-input').files[0]; if(!f){showErr(lang==='bn'?'একটি ছবি বেছে নিন।':'Choose a photo first.');return;}
  var fd=new FormData(); fd.append('photo',f);
  var pk=$('photo-kind'); if(pk)fd.append('kind',pk.value);
  try{await api('/api/jobs/'+encodeURIComponent(currentJobId)+'/photos',{method:'POST',body:fd});openJob(currentJobId);}
  catch(e){showErr(e.message);}});
 $('form-dispute').addEventListener('submit',async function(ev){ev.preventDefault();clearErr();
  try{await api('/api/jobs/'+encodeURIComponent(currentJobId)+'/disputes',{method:'POST',body:JSON.stringify({category:$('dis-category').value,statement:$('dis-text').value.trim()})});openJob(currentJobId);}
  catch(e){showErr(e.message);}});
 $('btn-close-job').addEventListener('click',async function(){clearErr();
  /* The server requires either the worker's close-confirm OTP or an
     explicit closeAnyway — sending neither always 400s, so the old button
     could never close a job. The OTP comes from the worker's page. */
  try{var body={confirmCompletion:true};
   if($('close-force')&&$('close-force').checked){body.force=true;body.note='Closed by hirer before all milestones were approved.';}
   var cotp=$('close-otp')?$('close-otp').value.trim():'';
   if(cotp)body.workerOtpCode=cotp;
   if($('close-anyway')&&$('close-anyway').checked)body.closeAnyway=true;
   await api('/api/jobs/'+encodeURIComponent(currentJobId)+'/close',{method:'POST',body:JSON.stringify(body)});openJob(currentJobId);}
  catch(e){showErr(e.message);}});
 $('btn-passport-add').addEventListener('click',function(){
  /* Worker-owned: only the worker (from their link) can add a job to
     their WorkPassport and choose what it shows. The hirer cannot publish
     the worker's record — the worker does it from the worker page. */
  var box=$('passport-box');
  if(box)box.innerHTML='<p class="small">'+(lang==='bn'?'WorkPassport worker-এর নিজের: কাজ শেষ হলে worker নিজের লিংক থেকে এই কাজটি যোগ করবেন, আর কী দেখাবে তা নিজেই ঠিক করবেন।':'The WorkPassport belongs to the worker: after the job closes, the worker adds it from their own link and chooses what it shows.')+'</p>';
 });
 $('btn-resolvepack').addEventListener('click',function(){
  /* window.open carries no Authorization header, so the PDF route (which
     needs hirer or worker auth) would 401. The job-scoped worker token from
     the worker link authorises this one download, as it does worker.html. */
  var link=(currentJob&&(currentJob.workerLink||currentJob.worker_link))||'';
  var tok=''; try{tok=new URL(link,location.href).searchParams.get('token')||'';}catch(e){}
  window.open(API+'/api/jobs/'+encodeURIComponent(currentJobId)+'/resolvepack'+(tok?('?token='+encodeURIComponent(tok)):''),'_blank'); });
 $('btn-caas').addEventListener('click',async function(){clearErr();
  try{var r=await api('/api/billing/caas',{method:'POST',body:JSON.stringify({jobId:currentJobId})});
   var box=$('billing-box'); var id=r.chargeId||r.id||(r.caas&&r.caas.id);
   var otp=r.sandboxOtp||(r.sandbox&&r.sandbox.otp)||null;
   box.innerHTML='<div class="notice blue">'+(otp?(lang==='bn'?'আপনার কোড: ':'Your code: ')+esc(otp):(lang==='bn'?'OTP SMS-এ পাঠানো হয়েছে।':'OTP sent by SMS.'))+'</div>'+
    '<label>OTP</label><input id="caas-otp" type="text" inputmode="numeric" placeholder="OTP"><div class="btn-row"><button class="btn btn-dark btn-sm" type="button" id="caas-verify">Verify ৳10</button></div>';
   $('caas-verify').addEventListener('click',async function(){try{var v=await api('/api/billing/caas/'+encodeURIComponent(id||currentJobId)+'/verify',{method:'POST',body:JSON.stringify({otpCode:$('caas-otp').value.trim()})});box.innerHTML='<p class="mono">'+(v.status==='VERIFIED'?'PAID — ৳10 · RECORD ACTIVE':'STATUS: '+esc(v.status||'PENDING'))+'</p>';loadBillingStatus();}catch(e){showErr(e.message);}});
  }catch(e){showErr(e.message);}});
 $('btn-sub').addEventListener('click',async function(){clearErr();
  try{var r=await api('/api/billing/subscribe',{method:'POST',body:JSON.stringify({plan:'monthly'})});
   $('billing-box').innerHTML='<p class="mono">SUBSCRIBED — ৳70 / MONTH · '+(r.status||r.state||'ACTIVE')+'</p>';loadBillingStatus();
  }catch(e){showErr(e.message);}});
}

/* ---------- find a repairer: photo + nearby bidding (separate mode) ---------- */
/* A bid alone is never an agreement. Picking a bid creates a normal Job
   (pre-filled from the bid) which still needs dual OTP confirmation. */
var bidTrade='ELECTRICIAN', bidSite=null, findLoc=null, currentBidJobId=null;
function bidPhotosHtml(photos){
 if(!photos||!photos.length)return '<p class="small">—</p>';
 return '<div class="photo-grid">'+photos.map(function(u){
  return '<figure class="photo"><a href="'+esc(u)+'" target="_blank" rel="noopener"><img src="'+esc(u)+'" alt="'+(lang==='bn'?'সমস্যার ছবি':'Problem photo')+'" loading="lazy"></a></figure>';
 }).join('')+'</div>';
}
function bidDistText(b){
 if(b.distanceKm==null)return lang==='bn'?'দূরত্ব জানা নেই — লোকেশন দিন':'Distance unavailable — share your location';
 return (lang==='bn'?'সরলরেখা দূরত্ব: ':'Straight-line distance: ')+b.distanceKm+' km';
}
async function loadMyBidJobs(){
 var box=$('bid-mine-list'); if(!box)return; box.innerHTML='<p class="small">LOADING…</p>';
 try{var r=await api('/api/bid-jobs/mine'); var rows=r.bidJobs||[];
  box.innerHTML=rows.length?rows.map(function(b){
   return '<div class="job-row"><div><div class="t">'+esc(b.trade)+' — '+esc((b.description||'').slice(0,60))+'</div><div class="m">'+esc(b.status)+' · '+esc(b.liveBids||0)+' live bids · '+esc(fmtDate(b.created_at))+'</div></div><button class="btn btn-dark btn-sm" type="button" data-bidjob="'+esc(b.id)+'">'+(lang==='bn'?'দর দেখুন':'See bids')+'</button></div>';
  }).join(''):'<p class="small">'+(lang==='bn'?'এখনো কোনো দর-খোলা কাজ নেই।':'No open bid jobs yet.')+'</p>';
  box.querySelectorAll('[data-bidjob]').forEach(function(btn){btn.addEventListener('click',function(){openBidDetail(btn.getAttribute('data-bidjob'));});});
 }catch(e){box.innerHTML='<p class="small">'+esc(e.message)+'</p>';}
}
async function openBidDetail(id){
 currentBidJobId=id; clearErr();
 try{var r=await api('/api/bid-jobs/'+encodeURIComponent(id));
  var b=r.bidJob; var bids=r.bids||[];
  $('bid-detail-title').textContent=b.trade+' — '+((b.description||'').slice(0,80));
  $('bid-detail-meta').textContent=b.status+' · '+esc(fmtDate(b.created_at))+(b.siteArea?' · '+esc(b.siteArea):'');
  $('bid-detail-photos').innerHTML=bidPhotosHtml(b.photos);
  var bl=$('bid-list');
  bl.innerHTML=bids.length?bids.map(function(bd){
   var pass=bd.passport||{};
   var facts=[];
   if(pass.completedJobs!=null)facts.push((lang==='bn'?'সম্পন্ন কাজ: ':'Completed jobs: ')+pass.completedJobs);
   if(pass.trades&&pass.trades.length)facts.push((lang==='bn'?'কাজের ধরন: ':'Trades: ')+pass.trades.join(', '));
   return '<div class="job-row"><div><div class="t">'+taka(bd.amount)+' · '+esc(bd.workerName||bd.workerPhone||'')+'</div><div class="m">'+esc(bd.note||'')+(bd.earliestStart?' · '+(lang==='bn'?'শুরু: ':'Starts: ')+esc(bd.earliestStart):'')+'</div><div class="m">'+(bd.distanceKm!=null?(lang==='bn'?'সরলরেখা দূরত্ব: ':'Straight-line distance: ')+bd.distanceKm+' km':(lang==='bn'?'দূরত্ব জানা নেই':'Distance unavailable'))+' · '+esc(facts.join(' · '))+'</div><div class="m">'+esc(bd.status)+' · '+(lang==='bn'?'মেয়াদ: ':'Expires: ')+esc(fmtDT(bd.expires_at))+'</div></div>'+
   (bd.status==='LIVE'?'<button class="btn btn-dark btn-sm" type="button" data-accept="'+esc(bd.id)+'">'+(lang==='bn'?'বেছে নিন':'Pick this bid')+'</button>':'')+'</div>';
  }).join(''):'<p class="small">'+(lang==='bn'?'এখনো কোনো দর আসেনি।':'No bids yet.')+'</p>';
  bl.querySelectorAll('[data-accept]').forEach(function(btn){btn.addEventListener('click',async function(){
   clearErr();
   try{var acc=await api('/api/bid-jobs/'+encodeURIComponent(currentBidJobId)+'/bids/'+encodeURIComponent(btn.getAttribute('data-accept'))+'/accept',{method:'POST',body:'{}'});
    showNotice(lang==='bn'?'দর বেছে নেওয়া হয়েছে — এখন রেকর্ড তৈরি হয়েছে। দুই পক্ষের OTP দিয়ে নিশ্চিত করুন।':'Bid picked — the record is created. Both sides must now confirm by OTP.');
    if(acc&&acc.job&&acc.job.id)openJob(acc.job.id);
   }catch(e){showErr(e.message);}
  });});
  showView('view-bid-detail');
 }catch(e){showErr(e.message);}
}
async function loadOpenBidJobs(){
 var box=$('find-work-list'); if(!box)return; box.innerHTML='<p class="small">LOADING…</p>';
 var q=findLoc?('?lat='+findLoc.lat+'&lng='+findLoc.lng):'';
 $('find-loc-note').textContent=findLoc?(lang==='bn'?'আপনার লোকেশন: ':'Your location: ')+findLoc.lat+', '+findLoc.lng+' — '+(lang==='bn'?'কাছের কাজ আগে':'nearest first'):(lang==='bn'?'লোকেশন ছাড়া — নতুন কাজ আগে। দূরত্ব দেখতে “Use my location” চাপুন।':'No location — newest first. Tap “Use my location” to see distance.');
 try{var r=await api('/api/bid-jobs/open'+q); var rows=r.bidJobs||[];
  box.innerHTML=rows.length?rows.map(function(b){
   return '<div class="job-row" style="display:block"><div><div class="t">'+esc(b.trade)+' — '+esc((b.description||'').slice(0,80))+'</div><div class="m">'+bidDistText(b)+' · '+esc(b.bidCount||0)+' '+(lang==='bn'?'টি দর':'bids')+' · '+esc(fmtDate(b.created_at))+(b.siteArea?' · '+esc(b.siteArea):'')+'</div></div>'+
   bidPhotosHtml(b.photos)+
   '<div class="field-grid"><div><label>'+(lang==='bn'?'আপনার দাম (৳)':'Your price (৳)')+'</label><input type="number" min="1" inputmode="numeric" class="bid-amount" placeholder="4000"></div>'+
   '<div><label>'+(lang==='bn'?'কবে শুরু করতে পারবেন?':'Earliest start')+'</label><input type="text" class="bid-start" placeholder="e.g. 2026-11-28"></div></div>'+
   '<label>'+(lang==='bn'?'নোট (ঐচ্ছিক)':'Note (optional)')+'</label><input type="text" class="bid-note" maxlength="280" placeholder="'+(lang==='bn'?'যেমন: মালামালসহ':'e.g. including materials')+'">'+
   '<div class="btn-row"><button class="btn btn-dark btn-sm" type="button" data-bid="'+esc(b.id)+'">'+(lang==='bn'?'দর দিন':'Place bid')+'</button></div></div>';
  }).join(''):'<p class="small">'+(lang==='bn'?'এখন কোনো খোলা কাজ নেই।':'No open jobs right now.')+'</p>';
  box.querySelectorAll('[data-bid]').forEach(function(btn){btn.addEventListener('click',async function(){
   clearErr();
   var card=btn.closest('.job-row'); var amt=Number(card.querySelector('.bid-amount').value);
   if(!(amt>0)){showErr(lang==='bn'?'দাম ০-এর বেশি হতে হবে।':'Price must be more than 0.');return;}
   try{await api('/api/bid-jobs/'+encodeURIComponent(btn.getAttribute('data-bid'))+'/bids',{method:'POST',body:JSON.stringify({
     amount:amt,
     note:card.querySelector('.bid-note').value.trim()||undefined,
     earliestStart:card.querySelector('.bid-start').value.trim()||undefined,
     workerLat:findLoc?findLoc.lat:undefined, workerLng:findLoc?findLoc.lng:undefined})});
    showNotice(lang==='bn'?'দর দেওয়া হয়েছে — ২৪ ঘণ্টা কার্যকর থাকবে।':'Bid placed — valid for 24 hours.');
    loadOpenBidJobs();
   }catch(e){showErr(e.message);}
  });});
 }catch(e){box.innerHTML='<p class="small">'+esc(e.message)+'</p>';}
}
function initBidding(){
 var picker=$('bid-trade-picker');
 if(picker)picker.querySelectorAll('button').forEach(function(b){b.addEventListener('click',function(){
  bidTrade=b.getAttribute('data-trade');
  picker.querySelectorAll('button').forEach(function(x){x.setAttribute('aria-pressed',x===b?'true':'false');});});});
 $('btn-bid-post').addEventListener('click',function(){showView('view-bid-post');loadMyBidJobs();});
 $('btn-find-work').addEventListener('click',function(){showView('view-find-work');loadOpenBidJobs();});
 $('btn-bid-back').addEventListener('click',function(){showView('view-jobs');loadJobs();});
 $('btn-find-back').addEventListener('click',function(){showView('view-jobs');loadJobs();});
 $('btn-bid-detail-back').addEventListener('click',function(){showView('view-bid-post');loadMyBidJobs();});
 $('btn-bid-me').addEventListener('click',function(){
  if(!('geolocation' in navigator)){showErr(lang==='bn'?'এই ডিভাইসে লোকেশন পাওয়া যাচ্ছে না।':'Location is not available on this device.');return;}
  navigator.geolocation.getCurrentPosition(function(p){bidSite={lat:+p.coords.latitude.toFixed(6),lng:+p.coords.longitude.toFixed(6)};
   var el=$('bid-picked');el.hidden=false;el.textContent='SITE: '+bidSite.lat+', '+bidSite.lng;},
   function(e){showErr(e.message);},{enableHighAccuracy:true,timeout:10000});});
 $('btn-bid-clear').addEventListener('click',function(){bidSite=null;$('bid-address').value='';var el=$('bid-picked');if(el)el.hidden=true;});
 $('btn-find-loc').addEventListener('click',function(){
  if(!('geolocation' in navigator)){showErr(lang==='bn'?'এই ডিভাইসে লোকেশন পাওয়া যাচ্ছে না।':'Location is not available on this device.');return;}
  navigator.geolocation.getCurrentPosition(function(p){findLoc={lat:+p.coords.latitude.toFixed(6),lng:+p.coords.longitude.toFixed(6)};loadOpenBidJobs();},
   function(e){showErr(e.message);},{enableHighAccuracy:true,timeout:10000});});
 $('btn-find-refresh').addEventListener('click',loadOpenBidJobs);
 $('btn-bid-close').addEventListener('click',async function(){clearErr();
  try{await api('/api/bid-jobs/'+encodeURIComponent(currentBidJobId)+'/close',{method:'POST',body:'{}'});
   showNotice(lang==='bn'?'দর বন্ধ করা হয়েছে — কাউকে বাছা হয়নি।':'Bidding closed — nobody was picked.');
   showView('view-bid-post');loadMyBidJobs();
  }catch(e){showErr(e.message);}});
 $('form-bid-post').addEventListener('submit',async function(ev){ev.preventDefault();clearErr();
  var desc=$('bid-desc').value.trim();
  if(!desc){showErr(lang==='bn'?'সমস্যার বিবরণ লিখুন।':'Write a short description of the problem.');return;}
  try{var r=await api('/api/bid-jobs',{method:'POST',body:JSON.stringify({trade:bidTrade,description:desc,
    site:bidSite?{lat:bidSite.lat,lng:bidSite.lng,address:$('bid-address').value.trim()||undefined}:($('bid-address').value.trim()?{address:$('bid-address').value.trim()}:undefined)})});
   var id=r.bidJob&&r.bidJob.id; if(!id)throw new Error('No bid job id returned');
   var files=$('bid-photos').files||[];
   for(var i=0;i<Math.min(files.length,3);i++){
    var fd=new FormData(); fd.append('photo',files[i]);
    await api('/api/bid-jobs/'+encodeURIComponent(id)+'/photos',{method:'POST',body:fd});
   }
   showNotice(lang==='bn'?'কাজটি দরের জন্য দেওয়া হয়েছে।':'Job posted for bids.');
   $('form-bid-post').reset(); bidSite=null; var el=$('bid-picked'); if(el)el.hidden=true;
   loadMyBidJobs(); openBidDetail(id);
  }catch(e){showErr(e.message);}});
}

/* ---------- demo ---------- */
async function loadDemo(){
 clearErr();
 try{var r=await api('/api/demo/seed',{method:'POST',body:'{}'});
  var job=r.job||(r.jobs&&r.jobs[0]); var id=job&&(job.id||job._id);
  if(id){try{localStorage.setItem('dc_pending_demo',id);}catch(e){}}
  if(r&&r.workerLink){try{localStorage.setItem('dc_demo_workerlink',r.workerLink);}catch(e){}}
  if(!token){ /* demo seed may return a token; otherwise show login with demo phone */
   $('login-phone').value='01700000001'; showView('view-login');
   var extra=r&&r.sandboxOtps?(' '+(lang==='bn'?'নিশ্চিতকরণের কোড — Hirer: ':'Confirm codes — hirer ')+(r.sandboxOtps.hirerConfirm||'—')+' / '+(lang==='bn'?'Worker: ':'worker ')+(r.sandboxOtps.workerConfirm||'—')+'.'):'';
   showNotice(lang==='bn'?'ডেমো তৈরি হয়েছে। হিরার নম্বর 01700000001 দিয়ে OTP লগইন করুন। লগইনের পর ডেমো কাজটি নিজে থেকেই খুলবে।'+extra:'Demo seeded. Log in with hirer number 01700000001 and OTP. The demo job opens automatically after login.'+extra);
   document.getElementById('app').scrollIntoView({behavior:'smooth'}); return; }
  if(id)openJob(id); else loadJobs(),showView('view-jobs');
 }catch(e){showErr((lang==='bn'?'ডেমো লোড হয়নি: ':'Demo did not load: ')+e.message);}
}

/* ---------- nav: mark the section on screen ---------- */
function initNavSpy(){
 var links=document.querySelectorAll('.nav-links a[href^="#"]'); if(!links.length||!('IntersectionObserver' in window))return;
 var map={}; links.forEach(function(a){map[a.getAttribute('href').slice(1)]=a;});
 var obs=new IntersectionObserver(function(entries){
  entries.forEach(function(en){ if(en.isIntersecting){ var a=map[en.target.id]; if(a){ links.forEach(function(x){x.removeAttribute('aria-current');}); a.setAttribute('aria-current','true'); } } });
 },{rootMargin:'-40% 0px -55% 0px'});
 ['journey','price','why','faq','app'].forEach(function(id){var el=document.getElementById(id);if(el)obs.observe(el);});
}

/* ---------- boot ---------- */
document.addEventListener('DOMContentLoaded',function(){
 initNavSpy();
 applyI18n();
 /* Mobile hamburger menu */
 var mb=$('menu-btn');
 if(mb)mb.addEventListener('click',function(){
  var nav=document.getElementById('main-nav'); if(!nav)return;
  var open=nav.classList.toggle('open');
  mb.setAttribute('aria-expanded',open?'true':'false');});
 document.querySelectorAll('#main-nav a').forEach(function(a){a.addEventListener('click',function(){
  var nav=document.getElementById('main-nav'); if(nav)nav.classList.remove('open');
  if(mb)mb.setAttribute('aria-expanded','false');});});
 $('lang-bn').addEventListener('click',function(){setLang('bn');});
 $('lang-en').addEventListener('click',function(){setLang('en');});
 renderDotMap($('map-hero'),{w:560,h:480});
 renderDotMap($('map-footer'),{w:560,h:300,step:15});
 renderDotMap($('map-journey'),{w:520,h:360,step:16});
 initJourney(); initAuth(); initNewJob(); initDetail(); initBidding(); renderFairScope();
 /* P0/P2/P4 motion: hero tilt, price count-ups, photo lightbox. */
 initHeroTilt(); initPriceMotion(); initLightbox();
 $('cta-demo').addEventListener('click',loadDemo);
 $('cta-start').addEventListener('click',function(){ if(token){showView('view-jobs');loadJobs();} });
 if(token){
  /* Validate the stored token: a new OTP for the same phone rotates it. */
  api('/api/me').then(function(r){if(r&&r.user){user=r.user;localStorage.setItem('dc_user',JSON.stringify(user));}showView('view-jobs');loadJobs();})
  .catch(function(){token='';user=null;localStorage.removeItem('dc_token');localStorage.removeItem('dc_user');showView('view-login');});
 }else{showView('view-login');}
 if('serviceWorker' in navigator){navigator.serviceWorker.register('sw.js').catch(function(){});}
});
})();
