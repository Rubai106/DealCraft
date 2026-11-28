/* DealCraft — hirer app. English default (saved choice wins). Defensive fetch against the API contract. */
(function(){
'use strict';
var API=''; // same origin; backend serves public/ statically
var token=localStorage.getItem('dc_token')||'';
var user=null; try{user=JSON.parse(localStorage.getItem('dc_user')||'null');}catch(e){}
var lang=localStorage.getItem('dc_lang')||'en';
var currentJob=null, currentJobId=null, draft={trade:'ELECTRICIAN',answers:{},skipped:[],fsIndex:0,answersByTrade:{ELECTRICIAN:{},PAINTER:{},PLUMBER:{}},skippedByTrade:{ELECTRICIAN:[],PAINTER:[],PLUMBER:[]}};

/* ---------- i18n ---------- */
var I18N={
'nav.how':{bn:'কীভাবে কাজ করে',en:'How it works'},'nav.price':{bn:'খরচ',en:'Price'},'nav.why':{bn:'কেন',en:'Why'},'nav.faq':{bn:'প্রশ্ন',en:'FAQ'},'nav.app':{bn:'অ্যাপ',en:'App'},
'hero.title1':{bn:'দাম পরিষ্কার।',en:'Clear price.'},'hero.title2':{bn:'কাজ পরিষ্কার।',en:'Clear work.'},
'hero.sub':{bn:'ইলেকট্রিশিয়ান, পেইন্টার, প্লাম্বার — শর্ত, দাম, পেমেন্ট। দুই পক্ষের সম্মতিতে লেখা।',en:'Electrician, painter, plumber — scope, price, payments. Agreed by both sides.'},
'hero.cta1':{bn:'রেকর্ড শুরু করুন',en:'Start a record'},'hero.cta2':{bn:'ডেমো দেখুন →',en:'See the demo →'},
'hero.corner1':{bn:'ঢাকা · বাংলাদেশ',en:'DHAKA · BANGLADESH'},'hero.corner2':{bn:'স্ক্রল করুন — রেকর্ড কীভাবে তৈরি হয় দেখুন ↓',en:'SCROLL — SEE HOW A RECORD IS MADE ↓'},
'journey.title':{bn:'রেকর্ডের প্রতিটি ধাপ।',en:'Every step of the record.'},
'j1t':{bn:'FairScope — আগে প্রশ্ন, পরে কাজ',en:'FairScope — questions first, work after'},'j1p':{bn:'মাল, কোট, পয়েন্ট — সব প্রশ্নের উত্তর কাজের আগেই ঠিক করুন।',en:'Materials, coats, points — settle every question before work starts.'},
'j2t':{bn:'দুজনেই নিশ্চিত করুন — OTP',en:'Both sides confirm — OTP'},'j2p':{bn:'দুজনেই OTP দিয়ে রেকর্ড নিশ্চিত করেন — একজনের কথায় হয় না।',en:'Both sides confirm the record by OTP — one side alone cannot.'},
'j3t':{bn:'কাজ চলাকালীন — মাইলস্টোন আর ছবি',en:'During work — milestones and photos'},'j3p':{bn:'ধাপ শেষ হলে ছবি দিয়ে জানান, হায়ারার অনুমোদন দেন।',en:'When a step finishes, a photo reports it; the hirer approves.'},
'j4t':{bn:'টাকা দিলে — PayProof',en:'When you pay — PayProof'},'j4p':{bn:'টাকা দিলে লিখুন — ওয়ার্কার “পেয়েছি” বললে তবেই স্বীকৃত।',en:'Record a payment — it counts only when the worker says “Received”.'},
'j5t':{bn:'দাম বা সময় বদলাতে হলে — ChangeLock',en:'To change price or time — ChangeLock'},'j5p':{bn:'কাজ বাড়লে লিখিত প্রস্তাব — পুরনো দাম ৳১৮,০০০, নতুন ৳২০,০০০।',en:'If work grows, propose it in writing — old price ৳18,000, new ৳20,000.'},
'j6t':{bn:'মত না মিললে — Dispute + ResolvePack',en:'If you disagree — Dispute + ResolvePack'},'j6p':{bn:'দুই পক্ষের বক্তব্য এক জায়গায় — সবকিছু এক PDF-এ।',en:'Both sides\u2019 statements in one place — everything in one PDF.'},
'price.title':{bn:'সহজ খরচ। লুকানো কিছু নেই।',en:'Simple pricing. Nothing hidden.'},
'price.p1':{bn:'প্রতি রেকর্ড — যতটুকু ব্যবহার',en:'Per record — pay as you go'},
'price.p2':{bn:'প্রতি মাস — সীমাহীন রেকর্ড',en:'Per month — unlimited records'},
'price.p3':{bn:'ওয়ার্কার — সবসময় ফ্রি',en:'Workers — free, always'},
'why.title':{bn:'কেন লিখিত রেকর্ড?',en:'Why a written record?'},
'w1t':{bn:'মুখের কথা ভুলে যায়, লেখা থাকে',en:'Spoken words are forgotten; writing stays'},'w1p':{bn:'“বলেছিলাম” আর “বলিনি” — এই তর্কে কাজ আটকে যায়।',en:'“I said it” versus “you didn\u2019t” stalls work.'},
'w2t':{bn:'ঠিক না হওয়া কথা আগেই চোখে পড়ে',en:'Undecided terms show up early'},'w2p':{bn:'FairScope যা ঠিক হয়নি, তা বড় করে দেখায়।',en:'FairScope shows what is undecided, up front.'},
'w3t':{bn:'টাকার হিসাব সবসময় পরিষ্কার',en:'The money is always clear'},'w3p':{bn:'মোট কত, কত দেওয়া হয়েছে, কত বাকি — তিনটি সংখ্যা সবসময় একসাথে।',en:'Total, paid, remaining — three numbers, always together.'},
'w4t':{bn:'বদল হলে লিখিত প্রস্তাব',en:'Changes need a written proposal'},'w4p':{bn:'দাম বা সময় বদলাতে হলে ChangeLock প্রস্তাব লাগে।',en:'Changing price or time needs a ChangeLock proposal.'},
'faq.title':{bn:'প্রশ্ন ও উত্তর',en:'Questions & answers'},
'f1q':{bn:'DealCraft কি টাকা রাখে?',en:'Does DealCraft hold money?'},'f1a':{bn:'না। DealCraft কোনো টাকা রাখে না — শুধু টাকা দেওয়ার স্বীকৃতি লিখে রাখে।',en:'No. DealCraft holds no money — it records payment acknowledgements only.'},
'f2q':{bn:'ওয়ার্কারের কি টাকা দিতে হয়?',en:'Does a worker have to pay?'},'f2a':{bn:'না। ওয়ার্কারের জন্য DealCraft সবসময় ফ্রি।',en:'No. DealCraft is always free for workers.'},
'f3q':{bn:'OTP না দিলে কী হবে?',en:'What if the OTP is not given?'},'f3a':{bn:'রেকর্ড তৈরি হবে না। দুই পক্ষের OTP নিশ্চিতকরণ ছাড়া কোনো রেকর্ড কার্যকর হয় না।',en:'No record is made. Without OTP confirmation from both sides, no record takes effect.'},
'f4q':{bn:'দাম বদলাতে চাইলে?',en:'What if I want to change the price?'},'f4a':{bn:'ChangeLock-এ লিখিত প্রস্তাব দিন। অপর পক্ষ মানলে নতুন দাম কার্যকর হয়, না মানলে পুরনো দামই থাকে।',en:'Send a written proposal in ChangeLock. The new price applies only if the other side accepts; otherwise the old price stands.'},
'f5q':{bn:'টাকা দিয়েছি — প্রমাণ কী?',en:'I paid — what is the proof?'},'f5a':{bn:'PayProof-এ টাকার রেকর্ড করুন। ওয়ার্কার “পেয়েছি” বললে তবেই সেটি স্বীকৃত হয়।',en:'Record it in PayProof. It counts as acknowledged only when the worker says “Received”.'},
'f6q':{bn:'মত না মিললে কী করব?',en:'What if we disagree?'},'f6a':{bn:'Dispute খুলুন — দুই পক্ষের বক্তব্য এক জায়গায় থাকবে। ResolvePack PDF ডাউনলোড করে রাখতে পারবেন।',en:'Open a dispute — both sides\u2019 statements stay in one place. You can download the ResolvePack PDF.'},
'f7q':{bn:'WorkPassport কী?',en:'What is WorkPassport?'},'f7a':{bn:'ওয়ার্কারের কাজের পরিচয়পত্র — কতটি কাজ শেষ হয়েছে, কোন ধরনের কাজ। টাকার অঙ্ক, ক্লায়েন্টের নাম আর ছবি ওয়ার্কার না চাইলে দেখানো হয় না।',en:'A worker\u2019s work identity — how many jobs were completed, and what kind. Amounts, client names and photos stay hidden unless the worker enables them.'},
'f8q':{bn:'AppLink কি সবার ফোনে কাজ করে?',en:'Does AppLink work on every phone?'},'f8a':{bn:'না। AppLink শুধু Banglalink গ্রাহকদের কাছে পৌঁছায়। অন্য অপারেটরের ক্ষেত্রে SMS/OTP পৌঁছাবে না।',en:'No. AppLink reaches Banglalink subscribers only. SMS/OTP will not reach other operators.'},
'app.title':{bn:'অ্যাপ — রেকর্ড শুরু করুন',en:'App — start a record'},
'app.lede':{bn:'ফোন নম্বর দিয়ে লগইন করুন। OTP আসবে SMS-এ।',en:'Log in with your phone number. The OTP arrives by SMS.'},
'login.title':{bn:'লগইন — ফোন + OTP',en:'Log in — phone + OTP'},'login.sub':{bn:'হায়ারার হিসেবে লগইন করুন।',en:'Log in as a hirer.'},
'login.phone':{bn:'ফোন নম্বর',en:'Phone number'},'login.name':{bn:'আপনার নাম (ঐচ্ছিক)',en:'Your name (optional)'},
'login.send':{bn:'OTP পাঠান',en:'Send OTP'},'login.otp':{bn:'OTP কোড',en:'OTP code'},'login.verify':{bn:'যাচাই করুন ও লগইন করুন',en:'Verify & log in'},'login.back':{bn:'ফিরে যান',en:'Back'},
'jobs.title':{bn:'আমার কাজ',en:'My jobs'},'jobs.logout':{bn:'লগ আউট',en:'Log out'},'jobs.new':{bn:'+ নতুন কাজ — FairScope',en:'+ New job — FairScope'},'jobs.refresh':{bn:'তালিকা আপডেট করুন',en:'Refresh list'},'jobs.empty':{bn:'এখনো কোনো কাজ নেই। নিচে + নতুন কাজ চাপ দিয়ে প্রথম রেকর্ড শুরু করুন।',en:'No jobs yet. Tap + New job below to start your first record.'},
'new.s1':{bn:'১ · ব্যবসা',en:'1 · Trade'},'new.s2':{bn:'২ · ফেয়ারস্কোপ',en:'2 · FairScope'},'new.s3':{bn:'৩ · দাম ও তারিখ',en:'3 · Price & dates'},'new.s4':{bn:'৪ · পর্যালোচনা',en:'4 · Review'},
'new.title':{bn:'নতুন কাজ — FairScope',en:'New job — FairScope'},'new.trade':{bn:'কাজের ধরন',en:'Trade — type of work'},
'new.workerPhone':{bn:'ওয়ার্কারের ফোন',en:'Worker phone'},'new.workerName':{bn:'ওয়ার্কারের নাম',en:'Worker name'},
'new.next':{bn:'পরের ধাপ — FairScope প্রশ্ন',en:'Next — FairScope questions'},'new.next2':{bn:'পরের ধাপ — দাম ও তারিখ',en:'Next — price & dates'},'new.back':{bn:'ফিরে যান',en:'Back'},
'new.fsHint':{bn:'প্রতিটি প্রশ্নের উত্তর দিন। যা ঠিক হয়নি, তা আলাদা করে দেখাবে।',en:'Answer every question. “Not decided” stays visible as a missing term.'},
'new.price':{bn:'সম্মত দাম (৳)',en:'Agreed price (৳)'},'new.deadline':{bn:'শেষ তারিখ',en:'Deadline'},'new.scope':{bn:'কাজের বিবরণ',en:'Scope — work description'},
'new.milestones':{bn:'মাইলস্টোন — ধাপ (ঐচ্ছিক)',en:'Milestones — steps (optional)'},'new.addMs':{bn:'+ মাইলস্টোন যোগ করুন',en:'+ Add milestone'},'new.review':{bn:'রেকর্ড দেখুন',en:'Review record'},
'new.create':{bn:'কাজ তৈরি করুন ও ওয়ার্কারকে পাঠান',en:'Create job & send to worker'},
'warn.title':{bn:'ঠিক হয়নি এমন শর্ত',en:'Missing terms — not decided'},'warn.text':{bn:'এখনো ঠিক হয়নি। প্রতিটি শর্তের উত্তর দিন, অথবা সেই শর্তটি আলাদাভাবে বাদ দিন — সব একসাথে নয়।',en:'Still undecided. Answer each one, or skip that one term explicitly — never in bulk.'},
'warn.resolve':{bn:'এখনই ঠিক করুন',en:'Resolve now'},
'bal.agreed':{bn:'সম্মত দাম',en:'Agreed'},'bal.paid':{bn:'স্বীকৃত পেমেন্ট',en:'Acknowledged paid'},'bal.rem':{bn:'বাকি',en:'Remaining'},
'detail.back':{bn:'← সব কাজ',en:'← All jobs'},'detail.confirmTitle':{bn:'হায়ারারের নিশ্চিতকরণ দরকার',en:'Hirer confirmation needed'},
'detail.confirmText':{bn:'ওয়ার্কার নিশ্চিত করেছেন। আপনার OTP দিয়ে রেকর্ডটি চূড়ান্ত করুন।',en:'The worker has confirmed. Finalise the record with your OTP.'},
'detail.confirmBtn':{bn:'OTP দিয়ে নিশ্চিত করুন',en:'Confirm with OTP'},
'detail.sendOtp':{bn:'নিশ্চিতকরণের OTP পাঠান',en:'Send confirm OTP'},
'detail.force':{bn:'তবুও বন্ধ করুন — সব মাইলস্টোন এখনো অনুমোদিত হয়নি',en:'Close anyway — not all milestones are approved yet'},
'detail.waitTitle':{bn:'ওয়ার্কারের নিশ্চিতকরণের অপেক্ষায়',en:'Waiting for worker confirmation'},
'detail.waitText':{bn:'ওয়ার্কার এখনো নিশ্চিত করেননি। ওয়ার্কার তাঁর লিংক থেকে OTP দিয়ে নিশ্চিত করলে আপনি এখানে নিশ্চিত করতে পারবেন।',en:'The worker has not confirmed yet. Once the worker confirms by OTP from their link, you can confirm here.'},
'detail.workerLinkTitle':{bn:'ওয়ার্কারের লিংক',en:'Worker link'},
'detail.resendLink':{bn:'ওয়ার্কারের লিংক আবার পাঠান',en:'Resend worker link'},
'detail.resendOk':{bn:'ওয়ার্কারের লিংক আবার পাঠানো হয়েছে।',en:'Worker link resent.'},
'detail.photoKind':{bn:'ছবির ধরন',en:'Photo kind'},
'detail.photoBefore':{bn:'আগে',en:'BEFORE — before work'},
'detail.photoAfter':{bn:'পরে',en:'AFTER — after work'},
'nav.menu':{bn:'মেনু',en:'Menu'},
'bill.statusTitle':{bn:'বিলিং অবস্থা',en:'Billing status'},
'bill.subActive':{bn:'সাবস্ক্রিপশন সক্রিয় — ৳৭০ / মাস',en:'Subscription active — ৳70 / month'},
'bill.subInactive':{bn:'কোনো সক্রিয় সাবস্ক্রিপশন নেই',en:'No active subscription'},
'bill.paidJobs':{bn:'পরিশোধিত কাজ',en:'Paid jobs'},
'bill.unpaidJobs':{bn:'অপরিশোধিত কাজ',en:'Unpaid jobs'},
'bill.statusUnknown':{bn:'বিলিং অবস্থা এখন দেখা যাচ্ছে না — পরে আবার চেষ্টা করুন।',en:'Billing status is unavailable right now — please try again later.'},
'detail.passport':{bn:'WorkPassport',en:'WorkPassport'},
'detail.passportText':{bn:'কাজ বন্ধ হওয়ার পর ওয়ার্কারের WorkPassport-এ যোগ করুন। কী দেখানো হবে, তা বেছে নিন।',en:'After the job closes, add it to the worker\u2019s WorkPassport. Choose what is shown.'},
'detail.passportBtn':{bn:'WorkPassport-এ যোগ করুন',en:'Add to WorkPassport'},
'detail.photos':{bn:'ছবি',en:'Photos'},'detail.addPhoto':{bn:'ছবি যোগ করুন',en:'Add a photo'},'detail.upload':{bn:'ছবি আপলোড করুন',en:'Upload photo'},
'detail.close':{bn:'কাজ বন্ধ করুন',en:'Close job'},'detail.closeText':{bn:'কাজ শেষ হলে দুই পক্ষের সম্মতিতে বন্ধ করুন।',en:'When work is done, close it with both sides\u2019 agreement.'},
'detail.closeHow':{bn:'ওয়ার্কার তার পাতায় “কাজ শেষ” চাপলে একটি কোড পান — সেই কোড এখানে লিখুন। কোড না থাকলে “একা বন্ধ করুন” বেছে নিন (শুধু হায়ারার)।',en:'The worker taps “Confirm close” on their page and gets a code — enter it here. Without the code, choose “Close alone” (hirer-only).'},
'detail.closeOtp':{bn:'ওয়ার্কারের বন্ধের কোড',en:'Worker close code'},
'detail.closeAnyway':{bn:'একা বন্ধ করুন — ওয়ার্কারের কোড ছাড়া (শুধু হায়ারার)',en:'Close alone — without the worker\u2019s code (hirer-only)'},
'detail.closeBtn':{bn:'কাজ বন্ধ করুন — সম্পূর্ণ হয়েছে নিশ্চিত করুন',en:'Close job — confirm completion'},'detail.pack':{bn:'ResolvePack ডাউনলোড (PDF)',en:'Download ResolvePack (PDF)'},
'detail.protectionTitle':{bn:'দাম সুরক্ষা — Price protection',en:'Price protection'},
'detail.protectionNone':{bn:'দাম বদলায়নি — প্রথমে যা ঠিক হয়েছিল, এখনো তাই।',en:'Price unchanged — what was first agreed is still the price.'},
'detail.evidenceTitle':{bn:'প্রমাণের প্যাক — ResolvePack ও যাচাই',en:'Evidence pack — ResolvePack + verify'},
'detail.evidenceNoChain':{bn:'এই সংস্করণে হ্যাশ চেইন নেই — ফিঙ্গারপ্রিন্ট দিয়ে যাচাই করা হচ্ছে।',en:'No hash chain in this build — verifying by fingerprint.'},
'detail.evidenceChain':{bn:'হ্যাশ চেইন',en:'Hash chain'},
'detail.evidenceVerify':{bn:'রেকর্ড যাচাই করুন',en:'Verify this record'},
'detail.evidenceVerified':{bn:'মিলেছে — ফিঙ্গারপ্রিন্ট মিলেছে',en:'Verified — fingerprint matches'},
'detail.evidenceMismatch':{bn:'মেলেনি — রেকর্ডটি যাচাই করা যায়নি',en:'No match — this record could not be verified'},
'detail.evidenceConfirmed':{bn:'দুই পক্ষের সম্মতিতে নিশ্চিত',en:'Confirmed by both sides'},
'detail.evidenceNotConfirmed':{bn:'এখনো দুই পক্ষের সম্মতি হয়নি',en:'Not yet confirmed by both sides'},
'detail.evidenceSuperseded':{bn:'পুরনো সংস্করণ — বর্তমান সংস্করণ দেখুন',en:'Superseded version — see the current version'},
'tab.timeline':{bn:'টাইমলাইন',en:'Timeline'},'tab.change':{bn:'ChangeLock',en:'ChangeLock'},'tab.pay':{bn:'PayProof',en:'PayProof'},'tab.miles':{bn:'মাইলস্টোন',en:'Milestones'},'tab.dispute':{bn:'Dispute',en:'Dispute'},'tab.billing':{bn:'বিলিং',en:'Billing'},
'change.title':{bn:'পরিবর্তনের প্রস্তাব — ChangeLock',en:'Propose a change — ChangeLock'},
'change.text':{bn:'দাম বা সময় বদলাতে হলে লিখিত প্রস্তাব দিন। ওয়ার্কার মানলে তবেই নতুন সংস্করণ (V2) হয়।',en:'To change price or time, send a written proposal. It becomes a new version (V2) only if the worker accepts.'},
'change.delta':{bn:'দামের পরিবর্তন (৳, যেমন +2000 বা -1000)',en:'Price change (৳, e.g. +2000 or -1000)'},'change.deadline':{bn:'নতুন শেষ তারিখ (ঐচ্ছিক)',en:'New deadline (optional)'},'change.reason':{bn:'কারণ',en:'Reason'},'change.send':{bn:'ওয়ার্কারকে প্রস্তাব পাঠান',en:'Send proposal to worker'},
'pay.title':{bn:'পেমেন্ট রেকর্ড — PayProof',en:'Record a payment — PayProof'},'pay.text':{bn:'টাকা দিলে এখানে লিখুন। ওয়ার্কার “পেয়েছি” বললে তবেই স্বীকৃত হয়।',en:'Write it here when you pay. It counts as acknowledged only when the worker says “Received”.'},
'pay.amount':{bn:'টাকার পরিমাণ (৳)',en:'Amount (৳)'},'pay.method':{bn:'মাধ্যম',en:'Method'},'pay.date':{bn:'তারিখ',en:'Date'},'pay.record':{bn:'পেমেন্ট রেকর্ড করুন',en:'Record payment'},
'miles.title':{bn:'মাইলস্টোন',en:'Milestones'},
'dispute.title':{bn:'বিরোধ',en:'Dispute'},'dispute.cat':{bn:'বিভাগ',en:'Category'},'dispute.text':{bn:'আপনার বক্তব্য',en:'Your statement'},'dispute.open':{bn:'Dispute খুলুন',en:'Open dispute'},
'bill.title':{bn:'বিলিং',en:'Billing'},'bill.text':{bn:'একটি রেকর্ড ৳১০, অথবা মাসে ৳৭০-তে সীমাহীন। ওয়ার্কারের জন্য DealCraft ফি নেই।',en:'One record is ৳10, or ৳70/month for unlimited records. No DealCraft fee for workers.'},
'bill.caas':{bn:'এই রেকর্ডের জন্য ৳১০ দিন',en:'Pay ৳10 for this record'},'bill.sub':{bn:'সাবস্ক্রাইব করুন ৳৭০ / মাস',en:'Subscribe ৳70 / month'},
'foot.text':{bn:'DealCraft কোনো টাকা রাখে না — শুধু টাকা দেওয়ার স্বীকৃতি লিখে রাখে।',en:'DealCraft holds no money — payment acknowledgements only.'},
'foot.title':{bn:'ফোনে কাজ শুরু হয়।',en:'Work starts on the phone.'},
'loc.title':{bn:'লাইভ লোকেশন',en:'Live location'},
'loc.privacy':{bn:'ওয়ার্কার নিজে শেয়ার চাপলেই কেবল আপনি দেখতে পাবেন — শুধু কাজ চলাকালীন। কাজ বন্ধ হলে লোকেশন মুছে যায়।',en:'You can see it only if the worker taps Share — only while the job is active. Location is deleted when the job closes.'},
'loc.notSharing':{bn:'শেয়ার করছে না',en:'Not sharing'},
'loc.stopped':{bn:'শেয়ার বন্ধ',en:'Sharing stopped'},
'loc.enRoute':{bn:'আসছে',en:'En route'},
'loc.arriving':{bn:'কাছে আসছে',en:'Arriving'},
'loc.arrived':{bn:'পৌঁছেছে',en:'Arrived on site'},
'loc.onSite':{bn:'কাজের জায়গায় আছে',en:'On site'},
'loc.paused':{bn:'বিরতি',en:'Paused'},
'loc.away':{bn:'সরলরেখা দূরত্ব',en:'straight-line distance'},'loc.eta':{bn:'পৌঁছাতে',en:'ETA'},
'site.title':{bn:'কাজের জায়গা (ঐচ্ছিক)',en:'Job site (optional)'},
'site.hint':{bn:'ম্যাপে ট্যাপ করে পিন বসান, অথবা আপনার বর্তমান লোকেশন ব্যবহার করুন।',en:'Tap the map to drop a pin, or use your current location.'},
'site.address':{bn:'ঠিকানা',en:'Address'},
'site.me':{bn:'আমার বর্তমান লোকেশন ব্যবহার করুন',en:'Use my current location'},
'site.clear':{bn:'জায়গা মুছুন',en:'Clear site'},
'nav.bid':{bn:'মিস্ত্রি খুঁজুন',en:'Find a repairer'},
'nav.live':{bn:'লাইভ লোকেশন',en:'Live'},
'live.title':{bn:'মিস্ত্রি কোথায়, চোখের সামনে।',en:'See your repairer on the way.'},
'live.sub':{bn:'কাজ শুরু হলে মিস্ত্রি লাইভ লোকেশন শেয়ার করেন — আপনি ম্যাপে দেখেন।',en:'Once work starts, your repairer shares live location — you watch it on the map.'},
'live.cta':{bn:'অ্যাপে লাইভ লোকেশন দেখুন →',en:'See live location in the app →'},
'live.privacy':{bn:'শুধু শেয়ার চলাকালীন, শুধু এই কাজের হায়ারার দেখেন।',en:'Only while sharing, and only for that job’s hirer.'},
'find.title':{bn:'ছবি দিন। দাম আসবে।',en:'Send a photo. Prices come back.'},
'find.sub':{bn:'সমস্যার ছবি তুলুন — কাছের মিস্ত্রিরা দাম দেবেন, আপনি বেছে নিন।',en:'Photograph the problem — nearby repairers bid a price, you choose.'},
'find.cta':{bn:'ছবি দিয়ে কাজ দিন →',en:'Post a job with a photo →'},
'find.example':{bn:'উদাহরণ',en:'Example'},
'find.honest':{bn:'দর দিলেই চুক্তি হয় না — রেকর্ড হয় দুই পক্ষের OTP-তে।',en:'A bid is not an agreement — the record is made by both sides’ OTP.'},
'find.jobPhoto':{bn:'ছবি',en:'Photo'},
'find.jobTrade':{bn:'ইলেকট্রিশিয়ান',en:'Electrician'},
'find.jobDesc':{bn:'বাথরুমের পাইপ ফেটে পানি পড়ছে',en:'Bathroom pipe burst — water leaking'},
'find.jobSite':{bn:'ধানমন্ডি, ঢাকা',en:'Dhanmondi, Dhaka'},
'find.lowest':{bn:'সবচেয়ে কম',en:'Lowest'},
'find.b1':{bn:'ইলেকট্রিশিয়ান · ২.১ কিমি',en:'Electrician · 2.1 km'},
'find.b1f':{bn:'১২টি কাজ শেষ · ইলেকট্রিশিয়ান',en:'12 jobs done · Electrician'},
'find.b2':{bn:'ইলেকট্রিশিয়ান · ৩.৪ কিমি',en:'Electrician · 3.4 km'},
'find.b2f':{bn:'৮টি কাজ শেষ · ইলেকট্রিশিয়ান',en:'8 jobs done · Electrician'},
'find.b3':{bn:'ইলেকট্রিশিয়ান · ৫.০ কিমি',en:'Electrician · 5.0 km'},
'find.b3f':{bn:'২৩টি কাজ শেষ · ইলেকট্রিশিয়ান',en:'23 jobs done · Electrician'},
'bid.postBtn':{bn:'মিস্ত্রি খুঁজুন — ছবি দিয়ে কাজ দিন',en:'Find a repairer — post with a photo'},
'bid.findBtn':{bn:'কাজ খুঁজুন — দর দিন',en:'Find work — bid on jobs'},
'bid.back':{bn:'← সব কাজ',en:'← All jobs'},
'bid.postTitle':{bn:'মিস্ত্রি খুঁজুন — ছবি দিয়ে কাজ দিন',en:'Find a repairer — post a job with a photo'},
'bid.postText':{bn:'সমস্যার ছবি তুলুন, কাজের ধরন বেছে নিন, সংক্ষেপে লিখুন। কাছের মিস্ত্রিরা দাম দেবেন — একজনকে বেছে নিলে দুই পক্ষ OTP দিয়ে নিশ্চিত করবেন।',en:'Take a photo of the problem, pick the trade, write a short description. Nearby repairers bid a price — pick one, then both sides confirm by OTP.'},
'bid.trade':{bn:'কাজের ধরন',en:'Trade — type of work'},
'bid.desc':{bn:'সমস্যাটা কী (সর্বোচ্চ ৫০০ অক্ষর)',en:'What is wrong? (max 500 characters)'},
'bid.photos':{bn:'সমস্যার ছবি (সর্বোচ্চ ৩টি)',en:'Photos of the problem (max 3)'},
'bid.address':{bn:'কাজের জায়গা',en:'Job site'},
'bid.me':{bn:'আমার বর্তমান লোকেশন ব্যবহার করুন',en:'Use my current location'},
'bid.clear':{bn:'জায়গা মুছুন',en:'Clear site'},
'bid.post':{bn:'দরের জন্য কাজ দিন',en:'Post job for bids'},
'bid.mine':{bn:'আমার দর-খোলা কাজ',en:'My open bid jobs'},
'bid.findTitle':{bn:'কাজ খুঁজুন — দর দিন',en:'Find work — bid on jobs'},
'bid.findText':{bn:'খোলা কাজ — কাছের কাজ আগে। দর দিলেই কাজ পাওয়া যায় না। হায়ারার বেছে নিলে দুই পক্ষ OTP দিয়ে নিশ্চিত করেন।',en:'Open jobs — nearest first. A bid alone does not win the job. The hirer picks one, then both sides confirm by OTP.'},
'bid.useLoc':{bn:'আমার লোকেশন ব্যবহার করুন — কাছের কাজ আগে',en:'Use my location — nearest first'},
'bid.refresh':{bn:'আপডেট করুন',en:'Refresh'},
'bid.acceptNote':{bn:'দর দিলেই চুক্তি হয় না — বেছে নিলে রেকর্ড তৈরি হয়, তারপর দুই পক্ষের OTP দিয়ে নিশ্চিত করতে হয়।',en:'A bid alone is not an agreement — picking one creates a record, which both sides must then confirm by OTP.'},
'bid.closeNoHire':{bn:'দর বন্ধ করুন — কাউকে বাছা হয়নি',en:'Close bidding — nobody picked'},
/* Section 2: labels for static showcase cards, journey card, price card,
   trade names, photo kinds, statuses and event labels. */
'trade.electrician':{bn:'ইলেকট্রিশিয়ান',en:'ELECTRICIAN'},
'trade.painter':{bn:'পেইন্টার',en:'PAINTER'},
'trade.plumber':{bn:'প্লাম্বার',en:'PLUMBER'},
'card.ghostVer':{bn:'V1 · বাতিল',en:'V1 · SUPERSEDED'},
'card.fp':{bn:'SHA-256 ফিঙ্গারপ্রিন্ট',en:'SHA-256 FINGERPRINT'},
'card.mainVer':{bn:'V2 · চালু',en:'V2 · ACTIVE'},
'card.foot':{bn:'V1 অক্ষত আছে · OTP-তে নিশ্চিত',en:'V1 KEPT INTACT · OTP-CONFIRMED'},
'chip.pay':{bn:'৳5,000 পেয়েছি — ওয়ার্কার · PayProof',en:'৳5,000 received — Worker · PayProof'},
'chip.otp':{bn:'✓ দুজনেই OTP নিশ্চিত করেছেন',en:'✓ Both confirmed by OTP'},
'demo.scope':{bn:'পুরো ফ্ল্যাটের রিওয়্যারিং · ২৪ পয়েন্ট',en:'Full flat rewiring · 24 points'},
'card.photoNote':{bn:'ছবি · মাইলস্টোন সম্পূর্ণ',en:'PHOTO · MILESTONE COMPLETE'},
'card.changeNote':{bn:'⇄ +৳2,000 · ChangeLock — আরও ২ পয়েন্ট · প্রস্তাব, জোর নয়',en:'⇄ +৳2,000 · ChangeLock — TWO EXTRA POINTS · PROPOSED, NOT FORCED'},
'card.packNote':{bn:'পুরো রেকর্ড · টাইমলাইন + ছবি',en:'FULL RECORD · TIMELINE + PHOTOS'},
'card.ghostNote':{bn:'V1 · ৳18,000 · অক্ষত আছে',en:'V1 · ৳18,000 · KEPT INTACT'},
'jc.ver1':{bn:'V1 · সম্মত',en:'V1 · AGREED'},
'jc.ver2':{bn:'V2 · দুই পক্ষ নিশ্চিত করেছে',en:'V2 · BOTH SIDES CONFIRMED'},
'price.v1':{bn:'12 × ৳10 ব্যবহার অনুযায়ী',en:'12 × ৳10 PAY-AS-YOU-GO'},
'price.v2':{bn:'মাসে ৳70-তে ১২টি রেকর্ড',en:'12 RECORDS AT ৳70 / MONTH'},
'price.v3':{bn:'আপনি বাঁচান',en:'YOU SAVE'},
'price.pb2':{bn:'৳70 / মাস',en:'৳70 / MONTH'},
'nav.skip':{bn:'মূল অংশে যান',en:'Skip to content'},
'loc.nomap':{bn:'ম্যাপ লোড হয়নি — শুধু লেখা দেখানো হচ্ছে।',en:'Map did not load — showing text only.'},
'why.live':{bn:'লাইভ লোকেশন — কাজ চালু থাকলে ওয়ার্কার তাঁর লোকেশন শেয়ার করতে পারেন, শুধু সেই কাজের হায়ারার দেখতে পান।',en:'Live location — while a job is active, the worker can share their location, visible only to that job\'s hirer.'},
'site.nomap':{bn:'ম্যাপ লোড হয়নি — ঠিকানা লিখুন।',en:'Map did not load — you can still type the address.'},
'pp.showAmounts':{bn:'টাকার অঙ্ক দেখান',en:'Show amounts'},
'pp.showClient':{bn:'ক্লায়েন্ট দেখান',en:'Show client'},
'pp.showPhotos':{bn:'ছবি দেখান',en:'Show photos'},
'dis.cat1':{bn:'কাজ শেষ হয়নি',en:'Work not completed'},
'dis.cat2':{bn:'কাজের মান',en:'Quality'},
'dis.cat3':{bn:'টাকা',en:'Payment'},
'dis.cat4':{bn:'কাজের পরিধি',en:'Scope or extra work'},
'dis.cat5':{bn:'সম্পত্তির ক্ষতি',en:'Property damage'},
'pay.mCash':{bn:'নগদ',en:'Cash'},
'kind.before':{bn:'আগে',en:'BEFORE'},
'kind.after':{bn:'পরে',en:'AFTER'},
'cl.agreed':{bn:'সম্মত',en:'AGREED'},
'cl.confirmed':{bn:'দুই পক্ষ নিশ্চিত করেছে',en:'BOTH SIDES CONFIRMED'},
'cl.proposed':{bn:'প্রস্তাবিত',en:'PROPOSED'},
'pay.ack':{bn:'স্বীকৃত',en:'Acknowledged'},
'pay.awaiting':{bn:'অপেক্ষায়',en:'Awaiting'},
'ms.title':{bn:'মাইলস্টোন',en:'Milestone'},
'ms.approved':{bn:'অনুমোদিত',en:'Approved'},
'ms.completeWait':{bn:'সম্পূর্ণ — অনুমোদনের অপেক্ষায়',en:'Complete — awaiting approval'},
'ms.pending':{bn:'অপেক্ষায়',en:'Pending'},
'site.picked':{bn:'জায়গা',en:'Site'},
'detail.workerLinkLabel':{bn:'ওয়ার্কার লিংক',en:'Worker link'},
'detail.missingPill':{bn:'ঠিক হয়নি',en:'Missing'},
'job.loading':{bn:'লোড হচ্ছে…',en:'LOADING…'},
'change.sent':{bn:'প্রস্তাব পাঠানো হয়েছে।',en:'Proposal sent.'},
'caas.verify':{bn:'৳10 যাচাই করুন',en:'Verify ৳10'},
'caas.paid':{bn:'পরিশোধিত — ৳10 · রেকর্ড চালু',en:'PAID — ৳10 · RECORD ACTIVE'},
'caas.status':{bn:'অবস্থা',en:'Status'},
'sub.done':{bn:'সাবস্ক্রাইব হয়েছে — ৳70 / মাস',en:'SUBSCRIBED — ৳70 / MONTH'},
'detail.skippedPill':{bn:'বাদ দেওয়া হয়েছে',en:'Skipped — explicit'},
'nav.about':{bn:'আমাদের কথা',en:'About'},
'app.home':{bn:'← হোম',en:'← Home'},
'app.more':{bn:'আরও',en:'More'},
'more.title':{bn:'আরও',en:'More'},
'more.metrics':{bn:'ব্যবহারের হিসাব',en:'Usage metrics'},
'prompt.label':{bn:'কাজটা বলুন — এক লাইনে',en:'Say the job — one line'},
'prompt.ph':{bn:'যেমন: ২ বেডরুম ফ্ল্যাটের রিওয়্যারিং, ১৮০০০, শুক্রবারের মধ্যে',en:'2 bedroom flat rewiring, 18000, by Friday'},
'prompt.go':{bn:'চলুন →',en:'Go →'},
'prompt.hint':{bn:'যেভাবে বলবেন, সেভাবেই লিখুন — বাংলা বা ইংরেজি',en:'TYPE IT LIKE YOU WOULD SAY IT — BANGLA OR ENGLISH'},
'prompt.answer':{bn:'উত্তর দিন →',en:'Answer →'},
'prompt.skip':{bn:'এটা বাদ দিন',en:'Skip this one'},
'hire.directT':{bn:'চেনা মিস্ত্রি নিন',en:'Hire someone I know'},
'hire.directS':{bn:'সরাসরি নিয়োগ — ৫ ধাপ, দুই পক্ষের OTP',en:'Direct hire — 5 steps, OTP both sides'},
'hire.bidsT':{bn:'দর নিন',en:'Get bids'},
'hire.bidsS':{bn:'মিস্ত্রি খুঁজুন — সবচেয়ে কম দাম আগে',en:'Find a repairer — cheapest first'},
'j5s1':{bn:'কাজ বলুন',en:'Say the job'},
'j5s2':{bn:'দুজনে নিশ্চিত করুন',en:'Both confirm'},
'j5s3':{bn:'লাইভ লোকেশন',en:'Live location'},
'j5s4':{bn:'এক ট্যাপে টাকা',en:'One tap paid'},
'j5s5':{bn:'শেষ',en:'Done'},
'demo.liveTag':{bn:'নমুনা ডেমো · ঢাকা',en:'SIMULATED DEMO · DHAKA'},
'demo.play':{bn:'▶ চালান',en:'▶ Play'},
'demo.pause':{bn:'⏸ থামান',en:'⏸ Pause'},
'demo.next':{bn:'পরের ধাপ →',en:'Next step →'},
'demo.open':{bn:'ডেমো রেকর্ড খুলুন →',en:'Open the demo record →'},
'otp.free':{bn:'যাচাইকরণ ফ্রি — এই কোডের জন্য কোনো চার্জ নেই।',en:'Verification is free — no charge for this code.'},
'step.s1':{bn:'১ · রেকর্ড',en:'1 · Record'},
'step.s2':{bn:'২ · নিশ্চিতকরণ',en:'2 · Confirm'},
'step.s3':{bn:'৩ · পথে',en:'3 · On the way'},
'step.s4':{bn:'৪ · পেমেন্ট',en:'4 · Payment'},
'step.s5':{bn:'৫ · শেষ',en:'5 · Done'},
'step.s2note':{bn:'দুই পক্ষ OTP দিয়ে নিশ্চিত করেন। দুজনে নিশ্চিত করলেই রেকর্ড ACTIVE হয় — আর তখনই একবার ৳১০ রেকর্ড ফি নেওয়া হয়।',en:'Both sides confirm by OTP. Only after both confirm is the record ACTIVE — and only then is the one ৳10 record fee charged.'},
'trip.share':{bn:'লাইভ ট্রিপ শেয়ার করুন ↗',en:'Share live trip ↗'},
'trip.linkLabel':{bn:'লাইভ ট্রিপ লিংক',en:'Live trip link'},
'trip.linkReady':{bn:'লাইভ ট্রিপ লিংক তৈরি — উপরের লিংকটি ব্যবহার করুন।',en:'Live trip link ready — use the link above.'},
'profile.verified':{bn:'✓ ফোন যাচাই করা',en:'✓ Phone verified'},
'profile.jobs':{bn:'সম্পন্ন কাজ',en:'Completed jobs'},
'profile.hirers':{bn:'আলাদা হায়ারার',en:'Distinct hirers'},
'profile.since':{bn:'সদস্য',en:'Member since'},
'profile.worker':{bn:'DealCraft ওয়ার্কার',en:'DealCraft worker'},
'profile.copyLink':{bn:'লিংক কপি করুন',en:'Copy link'},
'profile.linkCopied':{bn:'লিংক কপি হয়েছে।',en:'Link copied.'},
'trip.copied':{bn:'ট্রিপের লিংক কপি হয়েছে — যাকে পাঠাতে চান, তাকে দিন।',en:'Trip link copied — send it to whoever needs it.'},
'trip.unavailable':{bn:'এই সার্ভারে ট্রিপ শেয়ারিং এখনো চালু হয়নি।',en:'Trip sharing is not on this server yet.'},
'detail.call':{bn:'ওয়ার্কারকে কল করুন',en:'Call worker'},
'jobs.tabHirer':{bn:'আমি নিয়োগ দিয়েছি',en:'Jobs I hired'},
'jobs.tabWorker':{bn:'আমি কাজ করেছি',en:'Jobs I worked'},
'jobs.workerEmpty':{bn:'আপনি এখনো কোনো কাজ করেননি।',en:'No jobs you worked yet.'},
'jobs.workerNote':{bn:'আপনার ওয়ার্কার অ্যাকাউন্ট যুক্ত হলে এখানে আপনার কাজ দেখা যাবে।',en:'Worker jobs appear here once your worker account is linked.'},
'new.backToJobs':{bn:'← সব কাজ',en:'← All jobs'},
'new.msHint':{bn:'এক ট্যাপে সাধারণ ভাগ বসান — অথবা নিজে লিখুন।',en:'One tap fills the usual split — or type your own.'},
'new.review':{bn:'রেকর্ড দেখুন',en:'Review record'},
'bid.promptPh':{bn:'যেমন: রবিবারের মধ্যে ২ রুমের পেইন্টার দরকার',en:'need a painter for 2 rooms by Sunday'},
'bid.myBids':{bn:'আমার চালু দর',en:'My live bids'},
'bid.withdraw':{bn:'দর ফিরিয়ে নিন',en:'Withdraw bid'},
'bid.withdrawn':{bn:'দর ফিরিয়ে নেওয়া হয়েছে।',en:'Bid withdrawn.'},
'bid.yourBid':{bn:'আপনার দর',en:'Your bid'},
'receipt.title':{bn:'রসিদ — পেমেন্টের স্বীকৃতি',en:'Receipt — payment acknowledgement'},
'receipt.copy':{bn:'রসিদ কপি করুন',en:'Copy receipt'},
'receipt.copied':{bn:'রসিদ কপি হয়েছে।',en:'Receipt copied.'},
'receipt.fp':{bn:'রেকর্ড ফিঙ্গারপ্রিন্ট',en:'Record fingerprint'},
'price.note':{bn:'এই ফ্লোতে একমাত্র চার্জ ৳১০ রেকর্ড ফি — একবার, দুই পক্ষ নিশ্চিত করার পর। যাচাইকরণ ফ্রি — কোডের জন্য কোনো চার্জ নেই। AppLink শুধু Banglalink নম্বরে পৌঁছায় — অন্য অপারেটরে OTP/SMS যাবে না।',en:'The only charge in the flow is the ৳10 record fee, once, after both sides confirm. Verification is free — no charge for a code. AppLink reaches Banglalink subscribers only — OTP and SMS will not reach other operators.'},
'about.note':{bn:'দুই পক্ষের সম্মতিতে লেখা ডিজিটাল কাজের রেকর্ড — চুক্তিপত্র নয়। AppLink শুধু Banglalink গ্রাহকদের কাছে পৌঁছায়।',en:'A mutually confirmed digital work record — not a contract. AppLink reaches Banglalink subscribers only.'},
'demo.simNote':{bn:'নমুনা — আসল মিস্ত্রি নয়।',en:'Simulated — not a real worker.'},
'demo.replay':{bn:'আবার দেখুন',en:'Replay'},
'demo.preparing':{bn:'ডেমো তৈরি হচ্ছে…',en:'Preparing demo…'},
'demo.off':{bn:'এই সার্ভারে ডেমো বন্ধ আছে। নিজের নম্বর দিয়ে লগইন করে আসল রেকর্ড শুরু করুন।',en:'Demo is off on this server. Log in with your own number to start a real record.'},
'demo.restart':{bn:'ডেমো আবার শুরু করুন',en:'Restart demo'},
'demo.exit':{bn:'ডেমো থেকে বের হন',en:'Exit demo'},
'otp.resend':{bn:'কোড আবার পাঠান',en:'Resend code'},
'otp.valid':{bn:'কোড ৫ মিনিট কাজ করবে।',en:'Code works for 5 minutes.'},
'otp.resent':{bn:'নতুন কোড পাঠানো হয়েছে — SMS দেখুন।',en:'New code sent — check SMS.'},
'otp.resendIn':{bn:'{n} সেকেন্ড পর আবার পাঠান…',en:'Resend in {n}s…'},
'login.phoneErr':{bn:'01 দিয়ে শুরু ১১ অঙ্কের মোবাইল নম্বর দিন — যেমন 017XXXXXXXX।',en:'Enter an 11-digit mobile number starting with 01 — e.g. 017XXXXXXXX.'},
'login.wrongCode':{bn:'ভুল কোড — SMS দেখে আবার চেষ্টা করুন।',en:'Wrong code — check the SMS and try again.'},
'login.tooMany':{bn:'অনেকবার চেষ্টা হয়েছে — ৫ মিনিট পর আবার কোড নিন।',en:'Too many tries — wait 5 minutes, then resend the code.'},
'jobs.retry':{bn:'আবার চেষ্টা করুন',en:'Retry'},
'jobs.workerErr':{bn:'আপনার কাজের তালিকা আনা যায়নি — নেট দেখে Refresh চাপুন।',en:'Could not load jobs you worked — check connection, then tap Refresh.'},
'jobs.fAll':{bn:'সব',en:'All'},
'jobs.fWaiting':{bn:'অপেক্ষায়',en:'Waiting'},
'jobs.fActive':{bn:'চালু',en:'Active'},
'jobs.fDone':{bn:'শেষ',en:'Done'},
'new.workerLabel':{bn:'ওয়ার্কার',en:'Worker'},
'new.edit':{bn:'বদলান',en:'Edit'},
'prompt.siteToggle':{bn:'কাজের জায়গা যোগ করুন (ঐচ্ছিক)',en:'Add job site (optional)'},
'prompt.msToggle':{bn:'মাইলস্টোন যোগ করুন (ঐচ্ছিক)',en:'Add milestones (optional)'},
'prompt.parseFail':{bn:'লাইনটি পড়া যায়নি — নিচের প্রশ্নগুলোর উত্তর দিন।',en:'Could not read the job line — answer the questions below.'},
'draft.restored':{bn:'অসমাপ্ত কাজটি আবার শুরু হচ্ছে।',en:'Continuing your unfinished job.'},
'site.nomap2':{bn:'ম্যাপ আসেনি — ঠিকানাটা লিখে দিন।',en:'Map did not load — type the address instead.'},
'detail.nextConfirm':{bn:'পরের ধাপ: নিশ্চিতকরণ →',en:'Next: Confirm →'},
'detail.nextWay':{bn:'পরের ধাপ: পথে →',en:'Next: On the way →'},
'detail.nextPay':{bn:'পরের ধাপ: পেমেন্ট →',en:'Next: Payment →'},
'detail.nextDone':{bn:'পরের ধাপ: শেষ →',en:'Next: Done →'},
'detail.backJobs':{bn:'সব কাজে ফিরুন',en:'Back to My jobs'},
'detail.protectionSummary':{bn:'দামের ইতিহাস',en:'Price history'},
'detail.evidenceSummary':{bn:'প্রমাণের প্যাক',en:'Evidence pack'},
'detail.closeWithCode':{bn:'Worker-এর কোড দিয়ে বন্ধ করুন',en:'Close with the worker’s code'},
'detail.closeAloneWarn':{bn:'একা বন্ধ করলে এই কাজ WorkPassport-এ যোগ হবে না।',en:'Closing alone will not add this job to the WorkPassport.'},
'detail.closeHint':{bn:'Worker-এর কোড লিখুন, অথবা “একা বন্ধ করুন” বেছে নিন।',en:'Enter the worker’s code, or tick ‘Close alone’.'},
'detail.passportHirerNote':{bn:'WorkPassport ওয়ার্কারের নিজের — কাজ শেষ হলে ওয়ার্কার নিজের লিংক থেকে যোগ করবেন।',en:'The WorkPassport belongs to the worker — after the job closes, the worker adds it from their own link.'},
'detail.passportResend':{bn:'Worker-কে লিংক আবার পাঠান',en:'Resend the link to the worker'},
'detail.confirmWrong':{bn:'ভুল কোড — SMS দেখে আবার চেষ্টা করুন।',en:'Wrong code — check the SMS and try again.'},
'detail.confirmExpired':{bn:'কোডের মেয়াদ শেষ — Resend code চাপুন।',en:'Code expired — tap Resend code.'},
'otp.tooMany':{bn:'অনেকগুলো কোড পাঠানো হয়েছে — ৫ মিনিট অপেক্ষা করে Resend চাপুন।',en:'Too many codes sent — wait 5 minutes and tap Resend.'},
'loc.retry':{bn:'ম্যাপ আবার চেষ্টা করুন',en:'Try map again'},
'loc.fbWorkerWaiting':{bn:'WORKER HAS NOT SHARED YET',en:'WORKER HAS NOT SHARED YET'},
'loc.fbWaiting':{bn:'WAITING FOR WORKER TO SHARE',en:'WAITING FOR WORKER TO SHARE'},
'pay.confirmYes':{bn:'হ্যাঁ, রেকর্ড করুন',en:'Yes, record it'},
'pay.change':{bn:'বদলান',en:'Change'},
'pay.fullRem':{bn:'পুরো বাকি {amt}',en:'Full remaining {amt}'},
'pay.summaryTitle':{bn:'পেমেন্টের সারাংশ',en:'Payment summary'},
'pay.remAfter':{bn:'এই পেমেন্টের পর বাকি',en:'Remaining after this payment'},
'pay.photoTooLarge':{bn:'ছবি অনেক বড় — আবার চেষ্টা করুন।',en:'Photo too large — try again.'},
'ms.waiting':{bn:'ওয়ার্কারের অপেক্ষায়',en:'Waiting for worker'},
'receipt.share':{bn:'শেয়ার করুন',en:'Share'},
'receipt.print':{bn:'প্রিন্ট করুন',en:'Print'},
'receipt.shared':{bn:'রসিদ শেয়ার করা হয়েছে।',en:'Receipt shared.'},
'receipt.holdsNoMoney':{bn:'শুধু পেমেন্টের স্বীকৃতি — DealCraft কোনো টাকা রাখে না।',en:'Payment acknowledgement only — DealCraft holds no money.'},
'receipt.fpVerify':{bn:'রেকর্ড ফিঙ্গারপ্রিন্ট — যাচাই করতে Verify চাপুন',en:'Record fingerprint — tap Verify to check'},
'receipt.trade':{bn:'কাজের ধরন',en:'Trade'},
'receipt.worker':{bn:'ওয়ার্কার',en:'Worker'},
'trip.copiedNote':{bn:'লাইভ ট্রিপ লিংক কপি হয়েছে — এই লিংক যার কাছে আছে, সে শুধু এই ট্রিপের লোকেশন দেখতে পাবে, ফোন নম্বর নয়।',en:'Live trip link copied — anyone with this link sees only this trip’s location, no phone number.'},
'more.navChange':{bn:'বদল',en:'Change'},
'more.navDispute':{bn:'সমস্যা',en:'Dispute'},
'more.navPassport':{bn:'পাসপোর্ট',en:'Passport'},
'more.navBilling':{bn:'বিল',en:'Billing'},
'change.emptyErr':{bn:'দাম বা সময় — অন্তত একটি বদল লিখুন।',en:'Change the price or the time — at least one.'},
'bill.feePaid':{bn:'৳10 দেওয়া হয়েছে',en:'৳10 paid'},
'bill.unsub':{bn:'সাবস্ক্রিপশন বাতিল করুন',en:'Cancel subscription'},
'bill.unsubDone':{bn:'সাবস্ক্রিপশন বাতিল করা হয়েছে।',en:'Subscription cancelled.'},
'bid.picked':{bn:'ঠিকানা বেছে নেওয়া হয়েছে',en:'Address picked'},
'bid.deadline':{bn:'শেষ তারিখ',en:'Deadline'},
'bid.yourPrice':{bn:'আপনার দাম (৳)',en:'Your price (৳)'},
'bid.earliest':{bn:'কবে শুরু করতে পারবেন?',en:'Earliest start'},
'bid.note':{bn:'নোট (ঐচ্ছিক)',en:'Note (optional)'},
'bid.place':{bn:'দর দিন',en:'Place bid'},
'bid.cancel':{bn:'বাতিল করুন',en:'Cancel'},
'bid.pick':{bn:'বেছে নিন',en:'Pick this bid'},
'bid.amountErr':{bn:'দাম ০-এর বেশি হতে হবে।',en:'Price must be more than 0.'},
'bid.cheapest':{bn:'সবচেয়ে কম: {amt} · {name}',en:'Cheapest: {amt} · {name}'},
'bid.closedBids':{bn:'মেয়াদ শেষ / ফিরিয়ে নেওয়া দর',en:'Expired / withdrawn bids'},
'bid.noLoc':{bn:'লোকেশন ছাড়া দূরত্ব দেখা যাবে না — নতুন কাজ আগে দেখানো হচ্ছে।',en:'Without location, distance can’t be shown — newest jobs are shown first.'},
'bid.retryLoc':{bn:'আবার চেষ্টা করুন',en:'Try again'},
'bid.locSet':{bn:'আপনার লোকেশন দেওয়া হয়েছে — কাছের কাজ আগে',en:'Your location is set — nearest first'}
};
var NOT_DECIDED={bn:'ঠিক হয়নি',en:'Not decided'};
/* ---------- Section 2: event / status / trade label dictionaries ----------
   Every DB constant that can reach the UI is mapped here, BN + EN. Stored
   values never change (the backend still counts 'Not decided', event types
   stay SNAKE_CASE); only the rendered label is localised. Unknown values
   fall back to a prettified constant so nothing renders raw SNAKE_CASE. */
var EVENT_LABELS={
'AGREEMENT_CREATED':{bn:'রেকর্ড তৈরি হয়েছে',en:'Record created'},
'CONFIRMED_BY_HIRER':{bn:'হায়ারার নিশ্চিত করেছেন',en:'Hirer confirmed'},
'CONFIRMED_BY_WORKER':{bn:'ওয়ার্কার নিশ্চিত করেছেন',en:'Worker confirmed'},
'ARRIVED_ON_SITE':{bn:'ওয়ার্কার কাজের জায়গায় পৌঁছেছেন',en:'Worker arrived on site'},
'CHANGE_PROPOSED':{bn:'পরিবর্তনের প্রস্তাব দেওয়া হয়েছে',en:'Change proposed'},
'CHANGE_APPROVED':{bn:'পরিবর্তন মানা হয়েছে',en:'Change approved'},
'CHANGE_REJECTED':{bn:'পরিবর্তন মানা হয়নি',en:'Change rejected'},
'CHANGE_CLARIFIED':{bn:'পরিবর্তন নিয়ে প্রশ্ন করা হয়েছে',en:'Change clarified'},
'PAYMENT_RECORDED':{bn:'পেমেন্ট রেকর্ড করা হয়েছে',en:'Payment recorded'},
'PAYMENT_ACKNOWLEDGED':{bn:'পেমেন্ট স্বীকৃত হয়েছে',en:'Payment acknowledged'},
'PAYMENT_DISPUTED':{bn:'পেমেন্ট নিয়ে আপত্তি জানানো হয়েছে',en:'Payment disputed'},
'MILESTONE_COMPLETED':{bn:'মাইলস্টোন সম্পূর্ণ হয়েছে',en:'Milestone completed'},
'MILESTONE_APPROVED':{bn:'মাইলস্টোন অনুমোদিত হয়েছে',en:'Milestone approved'},
'PHOTO_ADDED':{bn:'ছবি যোগ করা হয়েছে',en:'Photo added'},
'DISPUTE_OPENED':{bn:'Dispute খোলা হয়েছে',en:'Dispute opened'},
'DISPUTE_RESOLVED':{bn:'Dispute মিটমাট হয়েছে',en:'Dispute resolved'},
'RESOLUTION_PROPOSED':{bn:'সমাধানের প্রস্তাব দেওয়া হয়েছে',en:'Resolution proposed'},
'RESOLUTION_ACCEPTED':{bn:'সমাধানের প্রস্তাব মানা হয়েছে',en:'Resolution accepted'},
'RESOLUTION_REJECTED':{bn:'সমাধানের প্রস্তাব মানা হয়নি',en:'Resolution rejected'},
'STATEMENT_ADDED':{bn:'বক্তব্য যোগ করা হয়েছে',en:'Statement added'},
'JOB_CLOSED':{bn:'কাজ বন্ধ করা হয়েছে',en:'Job closed'},
'BID_JOB_POSTED':{bn:'দরের জন্য কাজ দেওয়া হয়েছে',en:'Job posted for bids'},
'BID_JOB_PHOTO_ADDED':{bn:'দরের কাজে ছবি যোগ করা হয়েছে',en:'Photo added to bid job'},
'BID_PLACED':{bn:'দর দেওয়া হয়েছে',en:'Bid placed'},
'BID_ACCEPTED':{bn:'দর বেছে নেওয়া হয়েছে',en:'Bid accepted'},
'BID_NOT_SELECTED':{bn:'দর বাছা হয়নি',en:'Bid not selected'},
'BID_JOB_CLOSED_NO_HIRE':{bn:'দর বন্ধ করা হয়েছে — কাউকে বাছা হয়নি',en:'Bidding closed — nobody picked'},
/* Server-labelled events: the payload carries labelEn/labelBn (see
   server.js SUMMARY_SMS_LABELS / DEADLINE_PASSED_LABELS); the dictionary
   holds the same wording as a fallback and the renderer prefers the
   payload labels when present. */
'SUMMARY_SMS_SENT':{bn:'চুক্তির সারাংশ SMS-এ পাঠানো হয়েছে',en:'Agreement summary sent by SMS'},
'DEADLINE_PASSED':{bn:'শেষ তারিখ পার হয়েছে — নতুন তারিখ প্রস্তাব করা যাবে',en:'Deadline passed — a new deadline can be proposed'}
};
var STATUS_LABELS={
'DRAFT':{bn:'খসড়া',en:'Draft'},'PENDING':{bn:'অপেক্ষায়',en:'Pending'},
'ACTIVE':{bn:'চালু',en:'Active'},'CLOSED':{bn:'বন্ধ',en:'Closed'},
'DISPUTED':{bn:'Dispute খোলা',en:'Disputed'},'OPEN':{bn:'খোলা',en:'Open'},
'ACCEPTED':{bn:'বেছে নেওয়া হয়েছে',en:'Accepted'},
'CLOSED_NO_HIRE':{bn:'বন্ধ — কাউকে বাছা হয়নি',en:'Closed — no hire'},
'LIVE':{bn:'চালু',en:'Live'},'NOT_SELECTED':{bn:'বাছা হয়নি',en:'Not selected'},
'EXPIRED':{bn:'মেয়াদ শেষ',en:'Expired'},'AWAITING':{bn:'অপেক্ষায়',en:'Awaiting'},
'ACKNOWLEDGED':{bn:'স্বীকৃত',en:'Acknowledged'},'APPROVED':{bn:'অনুমোদিত',en:'Approved'},
'REJECTED':{bn:'মানা হয়নি',en:'Rejected'},'COMPLETE':{bn:'সম্পূর্ণ',en:'Complete'},
'COMPLETED':{bn:'সম্পূর্ণ',en:'Complete'},'CLARIFICATION':{bn:'প্রশ্ন করা হয়েছে',en:'Clarification'},
'RESOLVED':{bn:'মিটমাট হয়েছে',en:'Resolved'},'VERIFIED':{bn:'যাচাই হয়েছে',en:'Verified'},
'CANCELLED':{bn:'বাতিল',en:'Cancelled'},'FAILED':{bn:'ব্যর্থ',en:'Failed'}
};
var DISPUTE_CAT_LABELS={
'work not completed':{bn:'কাজ শেষ হয়নি',en:'Work not completed'},
'quality':{bn:'কাজের মান',en:'Quality'},'payment':{bn:'টাকা',en:'Payment'},
'scope or extra work':{bn:'কাজের পরিধি',en:'Scope or extra work'},
'property damage':{bn:'সম্পত্তির ক্ষতি',en:'Property damage'}
};
function prettifyConst(s){return String(s==null?'':s).replace(/_/g,' ').toLowerCase().replace(/(^| )([a-z])/g,function(m,p,c){return p+c.toUpperCase();});}
function eventLabel(type){var d=EVENT_LABELS[type];return d?(d[lang]||d.en):prettifyConst(type);}
/* Job / bid / payment / milestone / dispute statuses share one lookup. */
function statusLabel(s){if(s==null||s==='')return '—';var d=STATUS_LABELS[String(s).toUpperCase()];return d?(d[lang]||d.en):prettifyConst(s);}
function tradeLabel(tr){if(!tr)return '';var k='trade.'+String(tr).toLowerCase();return I18N[k]?t(k):tr;}
function kindLabel(k){if(!k)return '';var d={BEFORE:{bn:'আগে',en:'BEFORE'},AFTER:{bn:'পরে',en:'AFTER'}}[String(k).toUpperCase()];return d?(d[lang]||d.en):k;}
/* 'hirer:8801…' / 'worker:8801…' / bare 'hirer' / 'worker' -> localised role + phone. */
function actorLabel(a){
 if(a==null||a==='')return '';
 if(String(a).toLowerCase()==='system')return lang==='bn'?'সিস্টেম':'System';
 var m=String(a).match(/^(hirer|worker)[:\s]*(.*)$/i);
 if(!m)return String(a);
 var role=m[1].toLowerCase()==='hirer'?(lang==='bn'?'হায়ারার':'Hirer'):(lang==='bn'?'ওয়ার্কার':'Worker');
 return m[2]?role+' · '+m[2]:role;
}
/* FairScope lookups by the ENGLISH question text (the stored key): find the
   question in the job's trade first, then in any trade. Used wherever a
   stored answer / missing term is rendered — the detail record, the
   missing-terms lists, and event details. */
function fsQuestion(qEn,trade){
 var trades=trade?[trade]:[]; Object.keys(FAIRSCOPE).forEach(function(tr){if(trades.indexOf(tr)<0)trades.push(tr);});
 for(var i=0;i<trades.length;i++){var qs=FAIRSCOPE[trades[i]]||[];
  for(var j=0;j<qs.length;j++){if(qs[j].q.en===qEn)return qs[j];}}
 return null;
}
function fsQuestionLabel(qEn,trade){var q=fsQuestion(qEn,trade);return q?(q.q[lang]||q.q.en):qEn;}
function fsAnswerLabel(qEn,vEn,trade){
 if(vEn==='Not decided')return NOT_DECIDED[lang];
 var q=fsQuestion(qEn,trade); if(!q)return vEn;
 var ix=q.opts.en.indexOf(vEn); if(ix<0)return vEn;
 return (q.opts[lang]||q.opts.en)[ix];
}
function t(key){var d=I18N[key];return d?(d[lang]||d.en):key;}
function applyI18n(){document.documentElement.lang=lang;
 document.title=lang==='bn'?'DealCraft — দাম পরিষ্কার। কাজ পরিষ্কার।':'DealCraft — Clear price. Clear work.';
 document.querySelectorAll('[data-i18n]').forEach(function(el){var v=t(el.getAttribute('data-i18n'));if(v)el.textContent=v;});
 /* Placeholders are not data-i18n text: localise them here so no English
    placeholder survives in Bangla mode. */
 var PH={'login-name':{bn:'নাম',en:'Your name'},'otp-code':{bn:'6 অঙ্কের কোড',en:'6-digit code'},
 'confirm-otp':{bn:'OTP',en:'OTP'},'close-otp':{bn:'6 অঙ্কের কোড',en:'6-digit code'},
 'bid-desc':{bn:'যেমন: বাথরুমের পাইপ ফেটে পানি পড়ছে',en:'e.g. bathroom pipe burst, water leaking'},
 'bid-c-note':{bn:'যেমন: মালামালসহ',en:'e.g. including materials'},
 'bid-c-amount':{bn:'৪০০০',en:'4000'},
 'bid-address':{bn:'যেমন: বাড়ি ১২, রোড ৫, ধানমন্ডি, ঢাকা',en:'e.g. House 12, Road 5, Dhanmondi, Dhaka'},
 'site-address':{bn:'যেমন: বাড়ি ১২, রোড ৫, ধানমন্ডি, ঢাকা',en:'e.g. House 12, Road 5, Dhanmondi, Dhaka'},
 'job-scope':{bn:'যেমন: পুরো ফ্ল্যাটের রিওয়্যারিং, ২৪ পয়েন্ট',en:'e.g. full flat rewiring, 24 points'},
 'ch-reason':{bn:'যেমন: আরও ৩ পয়েন্ট যোগ হয়েছে',en:'e.g. 3 more points added'},
 'dis-text':{bn:'কী হয়েছে, সংক্ষেপে লিখুন',en:'What happened, in brief'},
 'bid-note':{bn:'যেমন: মালামালসহ',en:'e.g. including materials'},
 'worker-name':{bn:'ওয়ার্কারের নাম',en:'Worker name'}};
 Object.keys(PH).forEach(function(id){var el=$(id);if(el)el.setAttribute('placeholder',PH[id][lang]||PH[id].en);});
 document.querySelectorAll('[data-i18n-ph]').forEach(function(el){var v=t(el.getAttribute('data-i18n-ph'));if(v)el.setAttribute('placeholder',v);});
 document.querySelectorAll('.ms-title').forEach(function(el){el.setAttribute('placeholder',lang==='bn'?'মাইলস্টোনের নাম — যেমন: ওয়্যারিং শেষ':'Milestone title');});
 document.querySelectorAll('.ms-amount').forEach(function(el){el.setAttribute('placeholder',lang==='bn'?'টাকার পরিমাণ ৳':'Amount ৳');});
 var b=document.getElementById('lang-bn'),e=document.getElementById('lang-en');
 if(b)b.setAttribute('aria-pressed',lang==='bn'?'true':'false');
 if(e)e.setAttribute('aria-pressed',lang==='en'?'true':'false');
 localStorage.setItem('dc_lang',lang);}
function setLang(l){lang=l;applyI18n();if(typeof demoRender==='function')demoRender();renderFairScope();if(currentJob)renderDetail(currentJob);updateAppTitle();/* The journey card's version line is set by setJourneyState (scroll-driven), not by applyI18n — refresh it so it follows a language toggle. */var jv=$('jc-ver');if(jv&&typeof journeyState!=='undefined'&&journeyState>=0)jv.textContent=journeyState>=4?t('jc.ver2'):t('jc.ver1');}

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
  steps.forEach(function(s,i){s.classList.toggle('active', p*(steps.length)>i);});
  /* P1: the journey card follows the same scroll state. The card's own
     state changes are the progress — no scroll-percentage chrome. */
  var activeCount=0; steps.forEach(function(s){if(s.classList.contains('active'))activeCount++;});
  setJourneyState(Math.max(0,Math.min(5,activeCount-1)));
 }
 window.addEventListener('scroll',onScroll,{passive:true}); onScroll();
}

/* ---------- helpers ---------- */
function $(id){return document.getElementById(id);}
function showErr(msg){var e=$('app-error');if(!e)return;e.hidden=false;e.textContent=msg;clearNotice();}
function clearErr(){var e=$('app-error');if(e){e.hidden=true;e.textContent='';}}
/* P2-9: inline field errors — one <p class="field-err"> under each
   field (price / deadline / scope / worker phone / payment amount),
   set in the normal UI font (see .app-card p.field-err in style.css:
   .app-card p{color:#444} outranks a bare .field-err rule, so the
   override must name the full selector). fieldErr(id) with no message
   clears that one field; clearFieldErrs clears all five. */
function fieldErr(id,msg){
 var el=$(id); if(!el)return;
 if(!msg){el.hidden=true;el.textContent='';return;}
 el.hidden=false; el.textContent=msg;
}
function clearFieldErrs(){
 ['err-price','err-deadline','err-scope','err-worker-phone','err-pay-amount'].forEach(function(id){fieldErr(id);});
}
/* Neutral info/success notice (orange left edge) — info must never use the red error box. */
function showNotice(msg){var e=$('app-notice');if(!e)return;e.hidden=false;e.textContent=msg;clearErr();}
function clearNotice(){var e=$('app-notice');if(e){e.hidden=true;e.textContent='';}}
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function taka(n){if(n==null||n==='')return '—';return '৳'+Number(n).toLocaleString('en-IN');}
/* Milestone titles: the three known steps are stored with a title key
   ('advance' / 'first-stage' / 'completion', see buildReview) and
   localised at render; anything else is a custom title and renders raw.
   Older records carry no key, so the normalised title is the lookup key
   there — 'ADVANCE', 'Advance' and 'advance' all match. */
var MS_TITLE={'advance':{bn:'অগ্রিম',en:'Advance'},'first-stage':{bn:'প্রথম ধাপ',en:'First stage'},'completion':{bn:'সমাপ্তি',en:'Completion'}};
function msKeyForTitle(title){var k=String(title||'').trim().toLowerCase();if(k==='advance')return 'advance';if(k==='first stage')return 'first-stage';if(k==='completion')return 'completion';return null;}
function msTitleLabel(m){var t0=(m&&(m.title!=null?m.title:''))||'';var key=(m&&m.key)||msKeyForTitle(t0);var d=key?MS_TITLE[key]:null;return d?(d[lang]||d.en):t0;}
function fmtDate(d){if(!d)return '—';try{return new Date(d).toLocaleDateString(lang==='bn'?'bn-BD':'en-GB',{day:'numeric',month:'short',year:'numeric'});}catch(e){return String(d);}}
function fmtDT(d){if(!d)return '—';try{return new Date(d).toLocaleString(lang==='bn'?'bn-BD':'en-GB',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});}catch(e){return String(d);}}
function networkMsg(){return lang==='bn'?'নেটওয়ার্ক সমস্যা — সার্ভারে পৌঁছানো যায়নি।':'Network problem — could not reach the server.';}
/* OTP error mapping — never show a raw code to the user. E1851 = wrong
   code, E1850 = expired, E1855 = too many codes sent (AppLink limit). */
function otpErrText(e){
 var m=String((e&&e.message)||'');
 if(/E1851|mismatch/i.test(m))return t('detail.confirmWrong');
 if(/E1850|expired/i.test(m))return t('detail.confirmExpired');
 if(/E1855/.test(m))return t('otp.tooMany');
 return null;
}
async function api(path,opts){
 opts=opts||{}; opts.headers=opts.headers||{};
 if(!(opts.body instanceof FormData))opts.headers['Content-Type']='application/json';
 if(token)opts.headers['Authorization']='Bearer '+token;
 var res, data=null;
 try{res=await fetch(API+path,opts);}catch(e){throw new Error((lang==='bn'?'নেটওয়ার্ক সমস্যা — সার্ভারে পৌঁছানো যায়নি। ':'Network problem — could not reach the server. ')+e.message);}
 try{data=await res.json();}catch(e){data=null;}
 if(!res.ok){var m=(data&&(data.error||data.message))||('HTTP '+res.status);var errObj=new Error(m);errObj.status=res.status;throw errObj;}
 return data;
}
/* P1-5 (e): the app header carries a compact per-view page title, not
   the giant static display title. The title is copied from the visible
   view's own heading (detail: the job title; login: its h3; the rest:
   their view-head h2), so it follows the current language with no new
   strings; the static "App — start a record" text stays only as the
   fallback. Called from showView and setLang. */
function updateAppTitle(){
 var el=document.getElementById('app-page-title'); if(!el)return;
 var view=document.querySelector('.view:not([hidden])');
 var src=null;
 if(view)src=view.querySelector('.view-head h2')||view.querySelector('h3.app-title');
 var txt=src&&src.textContent?src.textContent.trim():'';
 el.textContent=txt||t('app.title');
}
function showView(id,dir){
 document.body.classList.add('show-app');
 ['view-login','view-jobs','view-new','view-detail','view-bid-info','view-bid-post','view-find-work','view-bid-detail'].forEach(function(v){
  var el=$(v); if(el)el.hidden=(v!==id);
 });
 var show=$(id);
 if(show){
  /* Each screen opens at its own start, not at a stale scroll position. */
  show.querySelectorAll('.view-scroll').forEach(function(scroller){scroller.scrollTop=0;});
  var cls=(dir==='back')?'view-enter-back':'view-enter-fwd';
  show.classList.remove('view-enter','view-enter-fwd','view-enter-back');
  void show.offsetWidth;
  show.classList.add(cls);
  /* Move keyboard and assistive-technology focus into the new screen. */
  requestAnimationFrame(function(){
   var heading=show.querySelector('.view-head h2, h2, h3');
   if(!heading)return;
   if(!heading.hasAttribute('tabindex'))heading.setAttribute('tabindex','-1');
   try{heading.focus({preventScroll:true});}catch(e){heading.focus();}
  });
 }
 var appSec=$('app'); if(appSec)appSec.classList.toggle('app-grey',id==='view-detail');
 updateAppTitle();
 if(id==='view-detail'){requestAnimationFrame(function(){moveTabInd();});setTimeout(moveTabInd,60);}
}

function showLanding(){document.body.classList.remove('show-app');}
/* ---------- motion helpers (P0–P4; transform/opacity only) ---------- */
var RM=(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches)||false;
/* Gate for motion that hides content until it reveals (FAQ collapse,
   scroll-reveal stagger): without JS, everything stays visible. */
document.documentElement.classList.add('js');
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
/* ---------- worker profile card (shared renderer) ----------
   One renderer, used on the job page (hirer view), the bidding pick
   screen, and — as an identical inline copy — worker.html and
   passport.html. Verified facts only: name, trade, "Phone verified"
   badge (OTP-confirmed), mutually-closed completed jobs, distinct
   hirers, member since. No phone number, no stars, no scores. No photo
   upload exists: photoUrl is null until a photo is ever present, and
   the card then renders a bold initials tile. */
function profileInitials(name){
 var parts=String(name||'').trim().split(/\s+/).filter(Boolean);
 if(!parts.length)return 'D';
 return (parts[0].charAt(0)+(parts.length>1?parts[parts.length-1].charAt(0):'')).toUpperCase();
}
function renderProfileCard(p,opts){
 if(!p)return '';
 opts=opts||{};
 var name=p.name||t('profile.worker');
 var trade=p.trade?tradeLabel(p.trade):'—';
 var photo=p.photoUrl
  ?'<img src="'+esc(p.photoUrl)+'" alt="">'
  :'<span class="pc-initials" aria-hidden="true">'+esc(profileInitials(name))+'</span>';
 var jobs=p.completedJobs!=null?p.completedJobs:0;
 var hirers=p.distinctHirers!=null?p.distinctHirers:0;
 var since=p.memberSince||'—';
 return '<article class="profile-card card-3d" aria-label="'+esc(name)+'">'
  +'<div class="pc-photo">'+photo+'</div>'
  +'<div class="pc-main">'
  +'<h3 class="pc-name">'+esc(name)+'</h3>'
  +'<p class="pc-trade">'+esc(trade)+'</p>'
  +'<span class="pill pill-orange pc-verified">'+esc(t('profile.verified'))+'</span>'
  +'<div class="pc-facts">'
  +'<div class="pc-fact"><b>'+esc(jobs)+'</b><span>'+esc(t('profile.jobs'))+'</span></div>'
  +'<div class="pc-fact"><b>'+esc(hirers)+'</b><span>'+esc(t('profile.hirers'))+'</span></div>'
  +(opts.hideSince?'':'<div class="pc-fact"><b>'+esc(since)+'</b><span>'+esc(t('profile.since'))+'</span></div>')
  +'</div></div></article>';
}
/* A bid row without a server workerProfile (old cached data) still gets
   the same card, built from the bid's own passport facts. */
function bidProfile(bd,trade){
 if(bd&&bd.workerProfile)return bd.workerProfile;
 var pass=(bd&&bd.passport)||{};
 return {name:(bd&&bd.workerName)||null,trade:trade||null,photoUrl:null,phoneVerified:true,
  completedJobs:pass.completedJobs!=null?pass.completedJobs:0,
  distinctHirers:pass.distinctHirers!=null?pass.distinctHirers:0,memberSince:null};
}
/* Copy a worker/trip link without ever printing the raw token URL. */
function copyLinkText(url,label){
 if(!url)return;
 function done(){showNotice(t('profile.linkCopied'));}
 if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(url).then(done,function(){showNotice(label||url);});
 else showNotice(label||t('profile.linkCopied'));
}
/* Motion gaps 2: FAQ accordion — one row open at a time, first open by
   default. Button semantics + aria-expanded; the i18n toggle keeps
   working because the question/answer text still carries data-i18n. */
function initFaq(){
 var rows=document.querySelectorAll('.faq-row'); if(!rows.length)return;
 function openRow(row){
  rows.forEach(function(r){
   var open=r===row; r.classList.toggle('open',open);
   var b=r.querySelector('.faq-q'); if(b)b.setAttribute('aria-expanded',open?'true':'false');
  });
 }
 rows.forEach(function(row){
  var b=row.querySelector('.faq-q'); if(!b)return;
  b.addEventListener('click',function(){openRow(row.classList.contains('open')?null:row);});
 });
 if(!document.querySelector('.faq-row.open'))openRow(rows[0]);
}
/* Motion gaps 4: sliding tab indicator — the black block MOVES between
   tabs (transform, 260ms ease-inout) instead of the active style jumping.
   Repositioned on click, on resize, and whenever the tab bar becomes
   visible (it is hidden while the login view shows). */
function moveTabInd(){
 var tabs=document.querySelector('.tabs'), ind=document.querySelector('.tab-ind');
 if(!tabs||!ind)return;
 var active=tabs.querySelector('button[aria-selected="true"]'); if(!active)return;
 var r=active.getBoundingClientRect(), tr=tabs.getBoundingClientRect();
 if(!r.width)return;
 ind.style.width=r.width+'px'; ind.style.height=r.height+'px';
 ind.style.transform='translate('+(r.left-tr.left)+'px,'+(r.top-tr.top)+'px)';
}
function initTabInd(){
 if(!document.querySelector('.tabs'))return;
 moveTabInd();
 var raf=null;
 window.addEventListener('resize',function(){if(raf)return;raf=requestAnimationFrame(function(){raf=null;moveTabInd();});});
 if('IntersectionObserver' in window){
  var o=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting)moveTabInd();});},{threshold:0.1});
  o.observe(document.querySelector('.tabs'));
 }
}
/* Motion gaps 5: hero entrance — cancelled by the first scroll or pointer
   interaction, everything settling to its final state at once. */
function initHeroEntrance(){
 if(RM)return;
 var hero=document.querySelector('.hero'); if(!hero)return;
 var done=false;
 function cancel(){if(done)return;done=true;hero.classList.add('hero-done');}
 window.addEventListener('scroll',cancel,{once:true,passive:true});
 hero.addEventListener('pointerdown',cancel,{once:true});
}
/* Motion gaps 6: scroll-reveal stagger — extends the existing
   IntersectionObserver pattern: siblings of a [data-stagger] group reveal
   70ms apart instead of all at once. */
function initStagger(){
 var groups=document.querySelectorAll('[data-stagger]'); if(!groups.length)return;
 if(RM||!('IntersectionObserver' in window)){groups.forEach(function(g){g.classList.add('in');});return;}
 var obs=new IntersectionObserver(function(entries){
  entries.forEach(function(en){
   if(!en.isIntersecting)return;
   var g=en.target; obs.unobserve(g);
   Array.prototype.forEach.call(g.children,function(ch,i){ch.style.transitionDelay=(i*70)+'ms';});
   g.classList.add('in');
  });
 },{threshold:0.15});
 groups.forEach(function(g){obs.observe(g);});
}
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
 $('jc-ver').textContent=s>=4?t('jc.ver2'):t('jc.ver1');
 $('jc-agreed').textContent=taka(agreed);
 $('jc-rem').textContent=taka(rem);
 tweenNum($('jc-paid'),prev>=3?5000:0,paid,650,taka);
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
  {q:{bn:'কে তার/মালামাল কিনবে?',en:'Who buys wires/materials?'},opts:{bn:['হায়ারার কিনবে','ওয়ার্কার কিনবে','দুজনে ভাগ করে'],en:['Hirer buys','Worker buys','Shared']}},
  {q:{bn:'তারের ব্র্যান্ড ও স্পেসিফিকেশন',en:'Wire brand and specification'},opts:{bn:['BRB / BBS','পলি কেবল','অন্য ব্র্যান্ড'],en:['BRB / BBS','Poly Cable','Other brand']}},
  {q:{bn:'পয়েন্টের সংখ্যা',en:'Number of points'},opts:{bn:['৫-এর কম','৫–১০','১০-এর বেশি'],en:['Under 5','5–10','Over 10']}},
  {q:{bn:'সার্কিট ব্রেকার কি অন্তর্ভুক্ত?',en:'Circuit breakers included?'},opts:{bn:['হ্যাঁ','না','আংশিক'],en:['Yes','No','Partly']}},
  {q:{bn:'দেয়াল কাটা ও মেরামত কি অন্তর্ভুক্ত?',en:'Wall cutting and wall repair — included?'},opts:{bn:['হ্যাঁ','না','শুধু কাটা'],en:['Yes','No','Cutting only']}},
  {q:{bn:'চূড়ান্ত টেস্টিং কি অন্তর্ভুক্ত?',en:'Final testing included?'},opts:{bn:['হ্যাঁ','না'],en:['Yes','No']}},
  {q:{bn:'পরিবহন খরচ',en:'Transport cost'},opts:{bn:['হায়ারার দেবে','ওয়ার্কার দেবে','দামে অন্তর্ভুক্ত'],en:['Hirer pays','Worker pays','Included in price']}},
  {q:{bn:'বর্জ্য অপসারণ',en:'Waste removal'},opts:{bn:['ওয়ার্কার করবে','হায়ারার করবে'],en:['Worker does it','Hirer does it']}}],
 PAINTER:[
  {q:{bn:'এলাকা / রুম',en:'Area / rooms'},opts:{bn:['১ রুম','২–৩ রুম','পুরো ফ্ল্যাট'],en:['1 room','2–3 rooms','Whole flat']}},
  {q:{bn:'কোটের সংখ্যা',en:'Number of coats'},opts:{bn:['১ কোট','২ কোট','৩ কোট'],en:['1 coat','2 coats','3 coats']}},
  {q:{bn:'প্রাইমার কি অন্তর্ভুক্ত?',en:'Primer included?'},opts:{bn:['হ্যাঁ','না'],en:['Yes','No']}},
  {q:{bn:'রঙের ব্র্যান্ড',en:'Paint brand'},opts:{bn:['Asian Paints','Berger','অন্য ব্র্যান্ড'],en:['Asian Paints','Berger','Other brand']}},
  {q:{bn:'সারফেস প্রস্তুতি',en:'Surface preparation'},opts:{bn:['পুট্টি + ঘষা','শুধু ঘষা','কিছুই না'],en:['Putty + sanding','Sanding only','None']}},
  {q:{bn:'আসবাব সরানো',en:'Furniture moving'},opts:{bn:['ওয়ার্কার করবে','হায়ারার করবে'],en:['Worker does it','Hirer does it']}},
  {q:{bn:'পরিষ্কার',en:'Cleanup'},opts:{bn:['ওয়ার্কার করবে','হায়ারার করবে'],en:['Worker does it','Hirer does it']}}],
 PLUMBER:[
  {q:{bn:'পাইপের উপাদান',en:'Pipe material'},opts:{bn:['CPVC','UPVC','GI'],en:['CPVC','UPVC','GI']}},
  {q:{bn:'ফিটিংস — হায়ারার দেবে নাকি ওয়ার্কার?',en:'Fixtures included or supplied by hirer'},opts:{bn:['হায়ারার দেবে','ওয়ার্কার দেবে','দামে অন্তর্ভুক্ত'],en:['Hirer supplies','Worker supplies','Included in price']}},
  {q:{bn:'দেয়াল ভাঙা ও মেরামত',en:'Wall breaking and restoration'},opts:{bn:['হ্যাঁ','না','শুধু ভাঙা'],en:['Yes','No','Breaking only']}},
  {q:{bn:'লিক টেস্টিং',en:'Leak testing'},opts:{bn:['হ্যাঁ','না'],en:['Yes','No']}},
  {q:{bn:'মালামালের দায়িত্ব',en:'Materials responsibility'},opts:{bn:['হায়ারার','ওয়ার্কার','ভাগ করে'],en:['Hirer','Worker','Shared']}}]
};
/* Answers are stored in ENGLISH: the backend counts exactly 'Not decided' as a
   missing term and keys answers by the English question text. The UI shows the
   localised label; the stored value is always the English option. */
function missingTerms(){
 var qs=FAIRSCOPE[draft.trade]||[];
 return qs.filter(function(q,i){return draft.answers[i]==='Not decided'||draft.answers[i]==null;}).map(function(q){return q.q.en;});
}
/* N5: answers live per trade — switching trade swaps the active set
   instead of clearing it, and switching back restores earlier answers. */
function freshDraft(trade){
 return {trade:trade||'ELECTRICIAN',answers:{},skipped:[],fsIndex:0,
  answersByTrade:{ELECTRICIAN:{},PAINTER:{},PLUMBER:{}},
  skippedByTrade:{ELECTRICIAN:[],PAINTER:[],PLUMBER:[]}};
}
function saveActiveTradeSet(){
 if(!draft||!draft.trade)return;
 if(!draft.answersByTrade)draft.answersByTrade={};
 if(!draft.skippedByTrade)draft.skippedByTrade={};
 draft.answersByTrade[draft.trade]=Object.assign({},draft.answers);
 draft.skippedByTrade[draft.trade]=draft.skipped.slice();
}
function syncTradePicker(){
 var p=$('trade-picker'); if(!p||!draft)return;
 p.querySelectorAll('button').forEach(function(x){x.setAttribute('aria-pressed',x.getAttribute('data-trade')===draft.trade?'true':'false');});
}
function switchTrade(tr){
 if(!tr||!FAIRSCOPE[tr])return;
 if(draft&&draft.trade===tr){syncTradePicker();return;}
 saveActiveTradeSet();
 if(!draft)draft=freshDraft(tr);
 draft.trade=tr;
 if(!draft.answersByTrade)draft.answersByTrade={};
 if(!draft.skippedByTrade)draft.skippedByTrade={};
 draft.answers=Object.assign({},draft.answersByTrade[tr]||{});
 draft.skipped=(draft.skippedByTrade[tr]||[]).slice();
 draft.fsIndex=0;
 syncTradePicker();
 renderFairScope();
 saveDraft();
}
/* N1: the worker summary line above the trade buttons. */
function updateWorkerSummary(){
 var el=$('worker-summary-text'); if(!el)return;
 var n=(($('worker-name')||{}).value||'').trim();
 var p=(($('worker-phone')||{}).value||'').trim();
 el.textContent=(n||'—')+' · '+(p||'—');
}
/* N6a: persist the unfinished draft (draft + visible field values) after
   every prompt answer and every FairScope answer. */
function saveDraft(){
 try{
  var fields={promptText:($('prompt-input-app')||{}).value||'',price:($('job-price')||{}).value||'',deadline:($('job-deadline')||{}).value||'',scope:($('job-scope')||{}).value||'',workerPhone:($('worker-phone')||{}).value||'',workerName:($('worker-name')||{}).value||'',site:draft.site||null};
  localStorage.setItem('dc_draft',JSON.stringify({draft:draft,fields:fields}));
 }catch(e){}
}
/* N2: the read-only summary shown once the details may be revealed. */
function renderNewSummary(){
 var box=$('new-summary'); if(!box)return;
 var w=(($('worker-name')||{}).value||'').trim();
 var ph=(($('worker-phone')||{}).value||'').trim();
 var price=($('job-price')||{}).value||'';
 var dl=($('job-deadline')||{}).value||'';
 var sc=($('job-scope')||{}).value||'';
 box.innerHTML='<h3>'+esc(tradeLabel(draft.trade))+' — '+(lang==='bn'?'এক পাতার কাজের রেকর্ড':'One-page work record')+'</h3><table>'+
  '<tr><th>'+esc(t('new.workerLabel'))+'</th><td>'+esc((w||'—')+' · '+(ph||'—'))+'</td></tr>'+
  '<tr><th>'+esc(t('new.price'))+'</th><td>'+esc(price?taka(Number(price)):'—')+'</td></tr>'+
  '<tr><th>'+esc(t('new.deadline'))+'</th><td>'+esc(dl?fmtDate(dl):'—')+'</td></tr>'+
  '<tr><th>'+esc(t('new.scope'))+'</th><td>'+esc(sc||'—')+'</td></tr></table>';
}
/* N2: reveal #new-details only once the prompt questions are done AND
   every FairScope question is answered. Returns nothing; renderFairScope
   reports whether all its questions are answered. */
function maybeRevealDetails(){
 var nd=$('new-details'); if(!nd)return;
 var qEmpty=!promptQ||promptQ.length===0;
 var fsDone=renderFairScope();
 if(qEmpty&&fsDone){nd.hidden=false;renderNewSummary();}
}
function renderFairScope(){
 var box=$('fs-questions'); if(!box)return false;
 var qs=FAIRSCOPE[draft.trade]||[];
 if(draft.fsIndex==null)draft.fsIndex=0;
 while(draft.fsIndex<qs.length&&draft.answers[draft.fsIndex]!=null)draft.fsIndex++;
 var prog=$('fs-progress');
 if(prog)prog.textContent=draft.fsIndex>=qs.length
  ?(lang==='bn'?'সব প্রশ্নের উত্তর হয়েছে':'All questions answered')
  :((lang==='bn'?'প্রশ্ন ':'Question ')+(draft.fsIndex+1)+' / '+qs.length);
 if(draft.fsIndex>=qs.length){
  box.innerHTML='<p class="small">'+(lang==='bn'?'সব প্রশ্ন শেষ — নিচে দাম ও মাইলস্টোন দেখুন।':'All questions done — price and milestones are below.')+'</p>';
  updateMissingWarn(); return true;
 }
 var i=draft.fsIndex, q=qs[i];
 var optsEn=q.opts.en, optsLoc=q.opts[lang]||q.opts.en;
 var btns=optsEn.map(function(o,oi){return '<button type="button" data-v="'+esc(o)+'">'+esc(optsLoc[oi])+'</button>';}).join('');
 box.innerHTML='<div class="q-block"><div class="q">'+esc(q.q[lang]||q.q.en)+'</div><div class="opt-row">'+btns+'</div>'
  +'<div class="btn-row"><button type="button" class="btn btn-dark-ghost btn-sm" data-skip-q="'+i+'">'+(lang==='bn'?'এই শর্তটি বাদ দিন':'Skip this term')+'</button></div></div>';
 box.querySelectorAll('button[data-v]').forEach(function(b){b.addEventListener('click',function(){
  draft.answers[i]=b.getAttribute('data-v');
  draft.skipped=draft.skipped.filter(function(x){return x!==q.q.en;});
  draft.fsIndex++; renderFairScope(); updateMissingWarn(); saveDraft(); maybeRevealDetails(); });});
 var sk=box.querySelector('[data-skip-q]');
 if(sk)sk.addEventListener('click',function(){
  if(draft.skipped.indexOf(q.q.en)<0)draft.skipped.push(q.q.en);
  draft.answers[i]='Not decided'; draft.fsIndex++; renderFairScope(); updateMissingWarn(); saveDraft(); maybeRevealDetails(); });
 updateMissingWarn();
 return false;
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
  return '<li><span>'+esc(fsQuestionLabel(m,null))+'</span> '+(skipped
   ?'<span class="pill pill-orange">'+esc(t('detail.skippedPill'))+'</span>'
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

/* ---------- dotted schematic map fallback (no network, no gradients) ----------
   Used when Leaflet tiles never arrive (or Leaflet itself never loads):
   a dotted-grid SVG with the worker dot, the site square and a dashed
   route, drawn from the real coordinates. The live map is never
   destroyed — the fallback only covers it, and the first tile that does
   arrive swaps the real map back in. */
function mapFallbackSVG(worker, site, waitingLabel){
 var pts=[];
 if(worker)pts.push({lat:worker.lat,lng:worker.lng});
 if(site)pts.push({lat:site.lat,lng:site.lng});
 function pos(p){
  if(pts.length<2)return {x:50,y:50};
  var lats=pts.map(function(q){return q.lat;}), lngs=pts.map(function(q){return q.lng;});
  var minLat=Math.min.apply(null,lats), maxLat=Math.max.apply(null,lats);
  var minLng=Math.min.apply(null,lngs), maxLng=Math.max.apply(null,lngs);
  var padLat=(maxLat-minLat)*0.15||0.01, padLng=(maxLng-minLng)*0.15||0.01;
  minLat-=padLat; maxLat+=padLat; minLng-=padLng; maxLng+=padLng;
  return {x:(p.lng-minLng)/(maxLng-minLng)*100, y:100-(p.lat-minLat)/(maxLat-minLat)*100};
 }
 var svg='<svg viewBox="0 0 100 62" preserveAspectRatio="none" style="width:100%;height:100%" role="img" aria-label="Schematic map">'
  +'<defs><pattern id="dg" width="6" height="6" patternUnits="userSpaceOnUse"><circle cx="3" cy="3" r="0.7" fill="#bbb"/></pattern></defs>'
  +'<rect x="0" y="0" width="100" height="62" fill="url(#dg)"/>';
 var wPos=worker?pos(worker):null, sPos=site?pos(site):null;
 if(wPos&&sPos)svg+='<path d="M '+wPos.x.toFixed(1)+' '+wPos.y.toFixed(1)+' L '+sPos.x.toFixed(1)+' '+sPos.y.toFixed(1)+'" fill="none" stroke="#666" stroke-dasharray="3 2" stroke-width="0.8"/>';
 if(sPos)svg+='<rect x="'+(sPos.x-2.5).toFixed(1)+'" y="'+(sPos.y-2.5).toFixed(1)+'" width="5" height="5" fill="#000" stroke="#FF5A1F" stroke-width="0.8"/><text x="'+(sPos.x+4).toFixed(1)+'" y="'+(sPos.y-3).toFixed(1)+'" font-family="monospace" font-size="3" fill="#111">SITE</text>';
 if(wPos)svg+='<circle cx="'+wPos.x.toFixed(1)+'" cy="'+wPos.y.toFixed(1)+'" r="4.8" fill="none" stroke="#fff" stroke-width="0.8"/><circle cx="'+wPos.x.toFixed(1)+'" cy="'+wPos.y.toFixed(1)+'" r="3.2" fill="#FF5A1F" stroke="#fff" stroke-width="1.2"/>';
 if(waitingLabel)svg+='<text x="50" y="59" text-anchor="middle" font-family="monospace" font-size="3" fill="#555">'+esc(waitingLabel)+'</text>';
 return svg+'</svg>';
}

/* ---------- job site picker (Leaflet, tap to drop a pin) ---------- */
var siteMap=null, siteMarker=null, siteTiles=null, siteTileErrors=0, siteTileLoads=0, siteTileTimer=null;
function setSite(lat,lng,silent){
 draft.site={lat:+lat.toFixed(6),lng:+lng.toFixed(6),address:($('site-address')||{}).value?$('site-address').value.trim():''};
 if(siteMap){if(siteMarker)siteMarker.setLatLng([lat,lng]);else siteMarker=L.marker([lat,lng]).addTo(siteMap);if(!silent)siteMap.setView([lat,lng],15);}
 var p=$('site-picked'); if(p){p.hidden=false;p.textContent=t('site.picked')+': '+draft.site.lat+', '+draft.site.lng+(draft.site.address?' · '+draft.site.address:'');}
 var sf=$('site-fallback'); if(sf&&!sf.hidden){var s=$('site-fallback-svg');if(s)s.innerHTML=mapFallbackSVG(null,draft.site||null,null);}
}
function showSiteFallback(){
 var fb=$('site-fallback'); if(!fb)return;
 var el=$('site-map'); if(el)el.hidden=true;
 var svgEl=$('site-fallback-svg'); if(svgEl)svgEl.innerHTML=mapFallbackSVG(null,draft.site||null,null);
 fb.hidden=false;
 var nm=$('site-nomap'); if(nm)nm.hidden=false;
}
function hideSiteFallback(){
 var fb=$('site-fallback'); if(fb)fb.hidden=true;
 var el=$('site-map'); if(el&&siteMap)el.hidden=false;
}
function siteAttachTiles(){
 var tiles=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap contributors'});
 tiles.on('tileload',function(){
  siteTileLoads++;
  if(siteTileTimer){clearTimeout(siteTileTimer);siteTileTimer=null;}
  var fb=$('site-fallback');
  if(fb&&!fb.hidden){siteTileErrors=0;hideSiteFallback();}
 });
 tiles.on('tileerror',function(){siteTileErrors++;if(siteTileErrors>=3)showSiteFallback();});
 return tiles;
}
function retrySiteMap(){
 if(!siteMap)return;
 siteTileErrors=0; siteTileLoads=0;
 if(siteTiles){try{siteMap.removeLayer(siteTiles);}catch(e){}}
 siteTiles=siteAttachTiles(); siteTiles.addTo(siteMap);
 siteMap.invalidateSize(); hideSiteFallback();
 if(siteTileTimer)clearTimeout(siteTileTimer);
 siteTileTimer=setTimeout(function(){if(!siteTileLoads)showSiteFallback();},6000);
}
function initSiteMap(){
 var el=$('site-map'); if(!el||siteMap)return;
 if(typeof L==='undefined'){showSiteFallback();return;}
 siteMap=L.map(el).setView([23.8103,90.4125],12);
 siteTiles=siteAttachTiles(); siteTiles.addTo(siteMap);
 /* If no tile ever arrives, say so plainly and show the dotted
    schematic instead of a blank map — the address field below stays
    usable either way. */
 siteTileTimer=setTimeout(function(){if(!siteTileLoads)showSiteFallback();},6000);
 siteMap.on('click',function(e){setSite(e.latlng.lat,e.latlng.lng);});
 if(draft.site)setSite(draft.site.lat,draft.site.lng,true);
 setTimeout(function(){siteMap.invalidateSize();},100);
 var rb=$('btn-site-retry'); if(rb)rb.onclick=retrySiteMap;
}

/* ---------- live location (hirer side) ---------- */
var locTimer=null, locMap=null, locMarker=null, locSiteMarker=null, locTrailLine=null, locRouteLine=null, locLastPos=null, locAnim=null, locWasSharing=false, locSite=null;
var locTiles=null, locTileErrors=0, locTileLoads=0, locTileTimer=null, locFallbackShown=false;
var LOC_STATUS={'not-sharing':'loc.notSharing','stopped':'loc.stopped','en-route':'loc.enRoute','arriving':'loc.arriving','arrived':'loc.arrived','on-site':'loc.onSite','paused':'loc.paused'};
function locStopAll(){if(locTimer){clearInterval(locTimer);locTimer=null;}if(locAnim){cancelAnimationFrame(locAnim);locAnim=null;}}
function showLocFallback(worker, site){
 var fb=$('loc-fallback'); if(!fb)return;
 var mapEl=$('loc-map'); if(mapEl)mapEl.hidden=true;
 var nm=$('loc-nomap'); if(nm)nm.hidden=true;
 var waiting=!worker?(site?t('loc.fbWorkerWaiting'):t('loc.fbWaiting')):null;
 var svgEl=$('loc-fallback-svg'); if(svgEl)svgEl.innerHTML=mapFallbackSVG(worker,site,waiting);
 var ft=$('loc-fallback-text'); if(ft)ft.textContent=(($('loc-text')||{}).textContent||'—');
 fb.hidden=false; locFallbackShown=true;
}
function hideLocFallback(){
 var fb=$('loc-fallback'); if(fb)fb.hidden=true;
 var mapEl=$('loc-map'); if(mapEl&&locMap)mapEl.hidden=false;
 locFallbackShown=false;
}
function locAttachTiles(){
 var tiles=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap contributors'});
 tiles.on('tileload',function(){
  locTileLoads++;
  if(locTileTimer){clearTimeout(locTileTimer);locTileTimer=null;}
  /* Tiles arrived late: swap the real map back in, reset the count. */
  if(locFallbackShown){locTileErrors=0;hideLocFallback();}
 });
 tiles.on('tileerror',function(){
  locTileErrors++;
  if(locTileErrors>=3)showLocFallback(locLastPos||null,locSite);
 });
 return tiles;
}
function retryLocMap(){
 if(!locMap)return;
 locTileErrors=0; locTileLoads=0;
 if(locTiles){try{locMap.removeLayer(locTiles);}catch(e){}}
 locTiles=locAttachTiles(); locTiles.addTo(locMap);
 locMap.invalidateSize(); hideLocFallback();
 if(locTileTimer)clearTimeout(locTileTimer);
 locTileTimer=setTimeout(function(){if(!locTileLoads)showLocFallback(locLastPos||null,locSite);},6000);
}
function locInitMap(view){
 var el=$('loc-map'); if(!el)return false;
 if(typeof L==='undefined'){showLocFallback(view.latest||null,view.site||null);return false;}
 $('loc-nomap').hidden=true;
 /* The map stays covered while the fallback is showing — every poll
    re-enters here, and unhiding it would put a blank tile box back
    above the schematic. The tileload handler unhides it when tiles
    actually arrive. */
 if(!locFallbackShown)el.hidden=false;
 if(locTileLoads>0&&locFallbackShown)hideLocFallback();
 if(view.site)locSite={lat:view.site.lat,lng:view.site.lng};
 if(!locMap){
  var c=view.site?[view.site.lat,view.site.lng]:[view.latest.lat,view.latest.lng];
  locMap=L.map(el).setView(c,14);
  locTiles=locAttachTiles(); locTiles.addTo(locMap);
  locMarker=L.marker(c,{icon:L.divIcon({className:'loc-dot',html:'<span class="loc-dot-in"></span>',iconSize:[18,18],iconAnchor:[9,9]})}).addTo(locMap);
  if(view.site)locSiteMarker=L.marker([view.site.lat,view.site.lng]).addTo(locMap).bindPopup(view.site.address||'Job site');
  locTrailLine=L.polyline([],{color:'#FF5A1F',weight:3}).addTo(locMap);
  locRouteLine=L.polyline([],{color:'#666666',weight:2,dashArray:'6 6'}).addTo(locMap);
  setTimeout(function(){locMap.invalidateSize();},100);
  /* One 6s check: no tile at all means the tiles are blocked — show
     the dotted schematic instead of a blank map box. */
  locTileTimer=setTimeout(function(){if(!locTileLoads)showLocFallback(view.latest||null,view.site||null);},6000);
 }
 return true;
}
function locAnimateTo(lat,lng){
 var from=locLastPos||{lat:lat,lng:lng};
 /* A jump over 500m is a new fix, not a movement — place it directly. */
 if(locMarker&&typeof L!=='undefined'){
  try{var d=L.latLng(from.lat,from.lng).distanceTo(L.latLng(lat,lng));if(d>500){locMarker.setLatLng([lat,lng]);locLastPos={lat:lat,lng:lng};return;}}catch(e){}
 }
 var start=performance.now(), dur=800; /* 800ms marker tween */
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
 /* Arrival-state change animates the status pill (200ms pop) instead of
    swapping text instantly. */
 if(view.status&&view.status!==locRender._lastStatus){
  locRender._lastStatus=view.status;
  if(!RM){pill.classList.remove('pill-flip');void pill.offsetWidth;pill.classList.add('pill-flip');}
 }
 var txt=[];
 if(view.distanceKm!=null)txt.push(t('loc.away')+': '+view.distanceKm+' km');
 if(view.etaMinutes!=null)txt.push(t('loc.eta')+': ~'+view.etaMinutes+' min');
 if(view.latest&&view.latest.updated_at)txt.push(new Date(view.latest.updated_at).toLocaleTimeString(lang==='bn'?'bn-BD':'en-GB',{hour:'2-digit',minute:'2-digit'}));
 $('loc-text').textContent=txt.join(' · ')||'—';
 var ft=$('loc-fallback-text'); if(ft&&locFallbackShown)ft.textContent=$('loc-text').textContent;
 /* latest is null until the worker shares anything — the server now
    answers 200 'not-sharing' instead of 404, so guard the null here or
    the render throws on the very first poll of an ACTIVE job. With no
    share yet, show the dotted schematic (site centred) instead of
    leaving a hidden, blank map box. */
 if(view.latest&&locInitMap(view)){
  locAnimateTo(view.latest.lat,view.latest.lng);
  if(view.site&&locSiteMarker)locSiteMarker.setLatLng([view.site.lat,view.site.lng]);
  if(locTrailLine)locTrailLine.setLatLngs((view.trail||[]).map(function(p){return [p.lat,p.lng];}));
  if(locRouteLine&&view.site)locRouteLine.setLatLngs([[view.latest.lat,view.latest.lng],[view.site.lat,view.site.lng]]);
 } else if(!view.latest){
  showLocFallback(null,view.site||null);
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


/* ---------- feature flags (server is the single source of truth) ----------
   FEATURE_BIDDING is OPT-IN (server/src/shared.js): only the exact
   value 'true' enables it; unset/false/anything else is OFF (the
   submission default). When off, every bidding entry point is REMOVED
   from the rendered page — the landing hero card, the nav link, the
   landing section and the in-app bidding buttons — so the rendered DOM
   contains no bids/repairer entry point and no user-facing mention.
   The flag is never hardcoded here — /api/config serves it. If the
   config cannot be read, bidding stays off (safe default = flag
   default). When on, the static markup is left exactly as served. */
var BIDDING_ON=false;
async function loadConfig(){
  try{var r=await api('/api/config');BIDDING_ON=!!(r&&r.biddingEnabled);}catch(e){BIDDING_ON=false;}
  applyBiddingVisibility();
}
function applyBiddingVisibility(){
  if(BIDDING_ON)return;
  var navFind=document.querySelector('.nav-links a[href="#find"]');
  if(navFind)navFind.remove();
  var sec=$('find'); if(sec)sec.remove();
  var hb=$('hire-bids'); if(hb)hb.remove();
  var bp=$('btn-bid-post'); if(bp)bp.remove();
  var fw=$('btn-find-work'); if(fw)fw.remove();
}

/* ---------- auth ---------- */
var loginPhone='';
/* G2: strip spaces/dashes and a leading +880/880, then require exactly
   an 11-digit 01[3-9] number. Anything else never reaches the API. */
function normalizeLoginPhone(raw){
 var p=String(raw||'').replace(/[\s\-()]/g,'');
 if(p.indexOf('+880')===0)p='0'+p.slice(4);
 else if(p.indexOf('880')===0&&p.length>11)p='0'+p.slice(3);
 return p;
}
function initAuth(){
 var f=$('form-login');
 if(f)f.addEventListener('submit',async function(ev){ev.preventDefault();clearErr();
  var rawPhone=$('login-phone').value.trim(); var name=$('login-name').value.trim();
  loginPhone=normalizeLoginPhone(rawPhone);
  if(!/^01[3-9]\d{8}$/.test(loginPhone)){showErr(t('login.phoneErr'));return;}
  try{var r=await api('/api/auth/request-otp',{method:'POST',body:JSON.stringify({phone:loginPhone,name:name||undefined})});
   $('form-login').hidden=true; $('form-otp').hidden=false;
   /* P0-3: the code is never rendered in the UI — it arrives by SMS.
      (Responses carry it only when the server runs with TEST_MODE=true
      for the test harness; the live adapter never returns a code.) */
   $('otp-code').focus();
  }catch(e){
   var oe0=otpErrText(e);
   if(oe0)showErr(oe0);
   else if(e.status===400)showErr(t('login.phoneErr'));
   else if(e.status===429)showErr(t('login.tooMany'));
   else showErr(networkMsg());
  }
 });
 var fo=$('form-otp');
 if(fo)fo.addEventListener('submit',async function(ev){ev.preventDefault();clearErr();
  var code=$('otp-code').value.trim();
  try{var r=await api('/api/auth/verify-otp',{method:'POST',body:JSON.stringify({phone:loginPhone,code:code})});
   if(r&&r.token){token=r.token;localStorage.setItem('dc_token',token);}
   if(r&&r.user){user=r.user;localStorage.setItem('dc_user',JSON.stringify(user));}
   var pend=null; try{pend=localStorage.getItem('dc_pending_demo');localStorage.removeItem('dc_pending_demo');}catch(e){}
   if(pend){openJob(pend);return;}
   var hire=null; try{hire=localStorage.getItem('dc_pending_hire');localStorage.removeItem('dc_pending_hire');}catch(e){}
   if(hire){startHire(hire);return;}
   showView('view-jobs'); loadJobs();
  }catch(e){
   if(e.status===400)showErr(t('login.phoneErr'));
   else if(e.status===401)showErr(t('login.wrongCode'));
   else if(e.status===429)showErr(t('login.tooMany'));
   else showErr(networkMsg());
  }
 });
 /* G3: digits only, auto-submit the code form at 6 digits (paste works
    through the same input listener). */
 var oc=$('otp-code'), otpAuto=false;
 if(oc)oc.addEventListener('input',function(){
  var d=oc.value.replace(/\D/g,'');
  if(d!==oc.value)oc.value=d;
  if(d.length<6){otpAuto=false;return;}
  if(d.length>6){oc.value=d.slice(0,6);d=oc.value;}
  if(!otpAuto){otpAuto=true;var form=$('form-otp');if(form){if(form.requestSubmit)form.requestSubmit();else form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));}}
 });
 /* G1: resend the same phone's code, 30s cooldown with countdown. */
 var rs=$('otp-resend'), rsTimer=null;
 if(rs)rs.addEventListener('click',async function(){
  if(!loginPhone||rs.disabled)return;
  clearErr();
  try{
   var r=await api('/api/auth/request-otp',{method:'POST',body:JSON.stringify({phone:loginPhone})});
   var codeEl=$('otp-code'); if(codeEl)codeEl.value='';
   otpAuto=false;
   /* P0-3: the code is never rendered in the UI — it arrives by SMS. */
   showNotice(t('otp.resent'));
   var left=30; rs.disabled=true;
   rs.textContent=t('otp.resendIn').replace('{n}',String(left));
   if(rsTimer)clearInterval(rsTimer);
   rsTimer=setInterval(function(){
    left--;
    if(left<=0){clearInterval(rsTimer);rsTimer=null;rs.disabled=false;rs.textContent=t('otp.resend');}
    else rs.textContent=t('otp.resendIn').replace('{n}',String(left));
   },1000);
  }catch(e){
   var oeR=otpErrText(e);
   if(oeR)showErr(oeR);
   else if(e.status===400)showErr(t('login.phoneErr'));
   else if(e.status===429)showErr(t('login.tooMany'));
   else showErr(networkMsg());
  }
 });
 var back=$('otp-back'); if(back)back.addEventListener('click',function(){$('form-otp').hidden=true;$('form-login').hidden=false;});
 var lo=$('btn-logout'); if(lo)lo.addEventListener('click',async function(){
  try{await api('/api/auth/logout',{method:'POST',body:'{}'});}catch(e){/* server logout is best-effort: the local session still ends below */}
  token='';user=null;demoJobId=null;localStorage.removeItem('dc_token');localStorage.removeItem('dc_user');try{var ks=[];for(var i=0;i<localStorage.length;i++){var k=localStorage.key(i);if(k&&k.indexOf('dc_job_')===0)ks.push(k);}ks.forEach(function(k){localStorage.removeItem(k);});}catch(e){}setDemoMode(false);showView('view-login','back');$('form-login').hidden=false;$('form-otp').hidden=true;});
}

/* ---------- jobs ---------- */
/* API rows use snake_case (worker_name, worker_phone, current_version). */
function pick(o,names){for(var i=0;i<names.length;i++){if(o&&o[names[i]]!=null&&o[names[i]]!=='')return o[names[i]];}return '';}
function jobTitle(j){var trade=tradeLabel(j.trade||j.scope||'JOB');var w=pick(j,['workerName','worker_name'])||pick(j,['workerPhone','worker_phone']);return (trade+' — '+w).toUpperCase();}
function jobPhone(j){return pick(j,['workerPhone','worker_phone']);}
function jobVersion(j,full){var vs=(full&&full.versions)||j.versions||[];return j.current_version||j.version||j.currentVersion||(vs.length||1);}
async function loadJobs(){
 clearErr(); var list=$('job-list'); if(!list)return; list.innerHTML='<p class="mono grey">'+esc(t('job.loading'))+'</p>';
 try{var r=await api('/api/jobs'); var jobs=Array.isArray(r)?r:(r.jobs||r.data||[]);
  $('me-line').textContent=user?((user.name||'')+' · '+(user.phone||'')):'';
  hirerJobsCache=jobs; renderHirerJobs();
 }catch(e){list.innerHTML='';showErr((lang==='bn'?'কাজের তালিকা আনা যায়নি: ':'Could not load jobs: ')+e.message);}
}
/* M4: the two job lists share one client-side filter over the already
   fetched array — no new request. WAITING = DRAFT+PENDING,
   DONE = CLOSED+DISPUTED. Newest-first order is kept (the server orders). */
var hirerJobsCache=[], workerJobsCache=[], workerJobsResp=null;
var jobsFilter='ALL', workerJobsFilter='ALL';
function applyJobFilter(jobs,f){
 if(f==='WAITING')return jobs.filter(function(j){var s=String(j.status||j.state||'').toUpperCase();return s==='DRAFT'||s==='PENDING';});
 if(f==='ACTIVE')return jobs.filter(function(j){return String(j.status||j.state||'').toUpperCase()==='ACTIVE';});
 if(f==='DONE')return jobs.filter(function(j){var s=String(j.status||j.state||'').toUpperCase();return s==='CLOSED'||s==='DISPUTED';});
 return jobs;
}
/* M1: title prefers the worker NAME over the phone; the meta line is
   [version, status, price, deadline] — price/deadline are omitted (not
   shown as —) when the row does not carry them. */
function jobRowHtml(j){
 var id=j.id||j._id; var ver='V'+(j.current_version||j.version||j.currentVersion||1);
 var status=j.status||j.state||'DRAFT';
 var price=pick(j,['price']); var dl=pick(j,['deadline']);
 var meta=[ver,statusLabel(status)];
 if(price!=null&&price!=='')meta.push(taka(price));
 if(dl)meta.push(fmtDate(dl));
 return '<div class="job-row"><div><div class="t">'+esc(jobTitle(j))+'</div><div class="m">'+meta.join(' · ')+'</div></div><div style="display:flex;gap:8px;align-items:center"><span class="pill '+((status==='CONFIRMED'||status==='ACTIVE')?'pill-orange':'pill-grey')+'">'+esc(statusLabel(status))+'</span><button class="btn btn-dark btn-sm" type="button" data-open="'+esc(id)+'">'+(lang==='bn'?'খুলুন':'Open')+'</button></div></div>';
}
function wireJobRows(list){
 list.querySelectorAll('[data-open]').forEach(function(b){b.addEventListener('click',function(){openJob(b.getAttribute('data-open'));});});
}
function renderHirerJobs(){
 var list=$('job-list'); if(!list)return;
 var jobs=applyJobFilter(hirerJobsCache,jobsFilter);
 $('jobs-empty').hidden=hirerJobsCache.length>0;
 list.innerHTML=jobs.map(jobRowHtml).join('')||'';
 wireJobRows(list);
}
function renderWorkerJobs(){
 var list=$('worker-jobs-list'); if(!list)return;
 var jobs=applyJobFilter(workerJobsCache,workerJobsFilter);
 $('worker-jobs-empty').hidden=workerJobsCache.length>0;
 /* The note is only for someone who has never worked a job: it shows
    when the request succeeded with zero jobs AND the server says this
    phone has never been a worker (everWorker === false). */
 $('worker-jobs-note').hidden=!(workerJobsCache.length===0&&workerJobsResp&&workerJobsResp.everWorker===false);
 list.innerHTML=jobs.map(jobRowHtml).join('')||'';
 wireJobRows(list);
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
  if(p.missingTerms&&p.missingTerms.length)bits.push((lang==='bn'?'ঠিক হয়নি: ':'Not decided: ')+p.missingTerms.map(function(m){return fsQuestionLabel(typeof m==='string'?m:(m.question||m.name||String(m)),null);}).join(', '));
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
 /* R2: the ChangeLock header — what is agreed right now. */
 var cn=$('change-now');
 if(cn)cn.textContent=(lang==='bn'?'এখন: ':'Now: ')+ver+' · '+taka(price)+' · '+(lang==='bn'?'শেষ তারিখ ':'Deadline ')+(deadline?fmtDate(deadline):'—');
 $('detail-meta').textContent=ver+' · '+taka(price)+' · '+(deadline?fmtDate(deadline):'—')+' · '+jobPhone(job);
 var pills=''; if(job.status)pills+='<span class="pill pill-orange">'+esc(statusLabel(job.status))+'</span>';
 if(job.workerLink)pills+='<span class="pill"><a href="'+esc(job.workerLink)+'" target="_blank" rel="noopener">'+esc(t('detail.workerLinkLabel'))+'</a></span>';
 var miss=job.missingTerms||(lv&&lv.scope?lv.scope.skippedTerms:[])||[];
 if(miss.length)pills+='<span class="pill pill-orange">'+esc(t('detail.missingPill'))+': '+miss.length+'</span>';
 $('detail-pills').innerHTML=pills;
 /* Worker profile card — the hirer view of the worker, same shared
    renderer as the bidding pick screen and the worker/passport pages.
    The profile rides on the job-detail response (full.workerProfile);
    a job opened from cache predating it simply shows no card. */
 var dp=$('detail-profile');
 if(dp){var wp=full.workerProfile||job.workerProfile||null;dp.innerHTML=wp?renderProfileCard(wp):'';}
 /* One-tap call: a real tel: link to the worker, set from the record. */
 var callBtn=$('btn-call-detail');
 if(callBtn){var ph=jobPhone(job);if(ph){callBtn.href='tel:'+ph.replace(/[^0-9+]/g,'');callBtn.hidden=false;}else callBtn.hidden=true;}
 /* Deadline nudge (one-tap "Propose new deadline"): shown only when a
    DEADLINE_PASSED event is on the timeline and the job is still ACTIVE.
    A nudge, never enforcement — it opens the existing ChangeLock flow
    pre-filled as a deadline extension (current deadline + 7 days) and
    changes nothing until the other side accepts. Plain lang-ternary
    strings here, not i18n-dictionary keys (Section 2 owns that dict). */
 var dpEv=null; for(var dei=0;dei<events.length;dei++){if(events[dei].type==='DEADLINE_PASSED'){dpEv=events[dei];break;}}
 var nudge=document.getElementById('deadline-nudge');
 if(dpEv&&job.status==='ACTIVE'){
  if(!nudge){nudge=document.createElement('div');nudge.id='deadline-nudge';nudge.className='notice';
   var tabsEl=document.querySelector('#view-detail .tabs');
   if(tabsEl&&tabsEl.parentNode)tabsEl.parentNode.insertBefore(nudge,tabsEl);}
  nudge.hidden=false;
  var dpDl=''; try{dpDl=JSON.parse(dpEv.payload_json||'{}').deadline||'';}catch(e){}
  var baseDl=deadline||dpDl||'';
  var nextDl=''; try{var nd=new Date(baseDl); nd.setDate(nd.getDate()+7); nextDl=nd.toISOString().slice(0,10);}catch(e){nextDl='';}
  nudge.innerHTML='<b>'+(lang==='bn'?'শেষ তারিখ পার হয়েছে':'Deadline passed')+'</b><p>'
   +(lang==='bn'?'কাজের শেষ তারিখ পার হয়ে গেছে। কোনো জরিমানা বা চার্জ নেই — নতুন তারিখ প্রস্তাব করুন।':'The deadline has passed. No penalty, no charge — propose a new deadline.')
   +'</p><div class="btn-row"><button class="btn btn-dark btn-sm" type="button" id="btn-deadline-propose">'
   +(lang==='bn'?'নতুন তারিখ প্রস্তাব করুন':'Propose new deadline')+'</button></div>';
  var dpBtn=$('btn-deadline-propose');
  if(dpBtn)dpBtn.addEventListener('click',function(){
   var tab=document.querySelector('.tabs button[data-tab="change"]'); if(tab)tab.click();
   var dl=$('ch-deadline'); if(dl&&nextDl)dl.value=nextDl;
   var rs=$('ch-reason'); if(rs)rs.value=(lang==='bn'?'কাজ শেষ হয়নি — নতুন শেষ তারিখ: '+nextDl:'Work is not finished yet — new deadline: '+nextDl);
   if(dl)dl.focus();
  });
 }else if(nudge){nudge.hidden=true;}
 /* one-page record from the latest version */
 var rec=$('detail-record');
 if(rec&&lv&&lv.scope){var sc=lv.scope;
  rec.hidden=false;
  rec.innerHTML='<h3>'+esc(tradeLabel(job.trade))+' — '+(lang==='bn'?'এক পাতার কাজের রেকর্ড':'One-page work record')+' ('+ver+')</h3><table>'+
   '<tr><th>'+(lang==='bn'?'বিবরণ':'Scope')+'</th><td>'+esc(sc.scope||'—')+'</td></tr>'+
   /* Item 10: stored answers are English keys — render the localised
      question and option labels for the job's trade. */
   Object.keys(sc.answers||{}).map(function(k){return '<tr><th>'+esc(fsQuestionLabel(k,job.trade))+'</th><td>'+esc(fsAnswerLabel(k,sc.answers[k],job.trade))+'</td></tr>';}).join('')+
   '</table>';
 } else if(rec){rec.hidden=true;}
 /* Item 16 (ceiling pass): price-creep protection — the first agreed
    price vs the current price, with every approved ChangeLock in
    between (old → new + reason). Data comes from full.priceProtection
    (server/src/shared.js jobDetail); no new claims, only the record. */
 var pp=full.priceProtection||job.priceProtection;
 var prot=$('detail-protection');
 var protWrap=$('detail-protection-wrap');
 if(prot&&pp&&pp.originalPrice!=null){
  prot.hidden=false; if(protWrap)protWrap.hidden=false;
  var chList=(pp.changes||[]).map(function(c){
   return '<li>'+esc(taka(c.oldPrice))+' → '+esc(taka(c.newPrice))
    +(c.priceDelta?(' ('+(c.priceDelta>0?'+':'-')+taka(Math.abs(c.priceDelta))+')'):'')
    +(c.reason?(' — '+esc(c.reason)):'')+'</li>';
  }).join('');
  prot.innerHTML='<h3>'+esc(t('detail.protectionTitle'))+'</h3>'
   +'<p><b>'+esc(taka(pp.originalPrice))+' → '+esc(taka(pp.currentPrice))+'</b></p>'
   +(chList?'<ul>'+chList+'</ul>':'<p class="small">'+esc(t('detail.protectionNone'))+'</p>');
 } else if(prot){prot.hidden=true; if(protWrap)protWrap.hidden=true;}
 /* Item 16: the evidence pack — one visible ResolvePack + verify action
    with the chain/fingerprint status. The per-event hash chain (Part 2)
    is in the tree: when evd.chainPresent, show its verified/broken
    status from the payload; otherwise fall back to the fingerprint-only
    note. The fingerprint verdict itself is still fetched live from
    /api/verify on tap — never assumed. */
 var evd=full.evidence||job.evidence;
 var evBox=$('detail-evidence');
 var evWrap=$('detail-evidence-wrap');
 if(evBox&&evd){
  evBox.hidden=false; if(evWrap)evWrap.hidden=false;
  var chainLine=evd.chainPresent
   ?esc(t('detail.evidenceChain'))+': '+esc(evd.chainStatus||'')
   :esc(t('detail.evidenceNoChain'));
  evBox.innerHTML='<h3>'+esc(t('detail.evidenceTitle'))+'</h3>'
   +'<p class="small">'+chainLine+'</p>'
   +'<p class="mono">FP '+esc(evd.fingerprint8||'')+'…</p>'
   +'<div class="btn-row"><button class="btn btn-dark btn-sm" type="button" id="btn-evidence-pack">'+esc(t('detail.pack'))+'</button>'
   +'<button class="btn btn-dark-ghost btn-sm" type="button" id="btn-evidence-verify">'+esc(t('detail.evidenceVerify'))+'</button></div>'
   +'<p class="small" id="evidence-verdict"></p>';
  var pkBtn=$('btn-evidence-pack');
  if(pkBtn)pkBtn.addEventListener('click',function(){var b=$('btn-resolvepack');if(b)b.click();});
  var vfBtn=$('btn-evidence-verify');
  if(vfBtn)vfBtn.addEventListener('click',async function(){
   var v=$('evidence-verdict'); if(!v)return;
   v.textContent='…';
   try{
    var r=await api(evd.verifyApiPath);
    if(r&&r.match){
     v.textContent=t('detail.evidenceVerified')
      +(r.versionState==='superseded'?(' — '+t('detail.evidenceSuperseded')):'')
      +' — '+(r.confirmedByBothSides?t('detail.evidenceConfirmed'):t('detail.evidenceNotConfirmed'));
    }else v.textContent=t('detail.evidenceMismatch');
   }catch(e){v.textContent=t('detail.evidenceMismatch');}
  });
 } else if(evBox){evBox.hidden=true; if(evWrap)evWrap.hidden=true;}
 var agreed=bal.agreed!=null?bal.agreed:price||0, paid=bal.acknowledgedPaid!=null?bal.acknowledgedPaid:0, rem=bal.remaining!=null?bal.remaining:(agreed-paid);
 /* P2: balance numbers count/tween to new values instead of snapping. */
 var prev=renderDetail._prevBal||{agreed:0,paid:0,rem:0};
 tweenNum($('bal-agreed'),prev.agreed,agreed,500,taka);
 tweenNum($('bal-paid'),prev.paid,paid,500,taka);
 tweenNum($('bal-rem'),prev.rem,rem,500,taka);
 renderDetail._prevBal={agreed:agreed,paid:paid,rem:rem};
 /* Read-aloud (Part 2, item 13): one-tap Listen on the record — trade,
    scope, price, paid, remaining, deadline in the UI language, via the
    browser's speech synthesis. setLang re-renders the detail, so the
    label follows the language toggle. */
 var lb=$('btn-listen');
 if(lb){
  lb.hidden=!(lv&&lv.scope);
  lb.textContent=lang==='bn'?'শুনুন':'Listen';
  lb.onclick=function(){
   var RA=window.DealCraftReadAloud;
   if(!RA||!('speechSynthesis' in window)){showNotice(lang==='bn'?'এই ব্রাউজারে শোনা যাবে না।':'This browser cannot read aloud.');return;}
   if(RA.isSpeaking&&RA.isSpeaking()){RA.stopSpeaking();lb.textContent=lang==='bn'?'শুনুন':'Listen';return;}
   var said=RA.speakRecord({trade:job.trade,scope:(typeof sc!=='undefined'&&sc)?sc.scope:'',price:agreed,paid:paid,remaining:rem,deadline:deadline},lang);
   if(said==null){showNotice(lang==='bn'?'শোনা যায়নি — আবার চেষ্টা করুন।':'Could not read aloud — try again.');return;}
   lb.textContent=lang==='bn'?'থামুন':'Stop';
   setTimeout(function(){lb.textContent=lang==='bn'?'শুনুন':'Listen';},Math.min(60000,Math.max(8000,said.length*150)));
  };
 }
 $('bar-paid').style.width=agreed?Math.min(100,paid/agreed*100)+'%':'0%';
 $('bar-agreed').style.width='0%';
 var dw=$('detail-warn'); if(dw){dw.hidden=!miss.length;var ul=$('detail-missing');if(ul)ul.innerHTML=miss.map(function(m){var q=typeof m==='string'?m:(m.question||m.name||JSON.stringify(m));return '<li>'+esc(fsQuestionLabel(q,job.trade))+'</li>';}).join('');}
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
 /* Worker link: a short pill + copy button only — the token URL is
    never printed as raw text on screen. */
 var wl=$('worker-link-box');
 if(wl){var link=job.workerLink||job.worker_link||'';
  wl.hidden=!link;
  var wlu=$('worker-link-url'); if(wlu&&link){wlu.textContent=t('detail.workerLinkLabel');wlu.href=link;}
  var wcb=$('btn-copy-link'); if(wcb){wcb.onclick=function(){copyLinkText(link,t('detail.workerLinkLabel'));};wcb.hidden=!link;}
 }
 /* timeline — events are {type, actor, payload_json, created_at} */
 var tl=$('timeline-list');
 tl.innerHTML=events.length?events.map(function(ev,ei){
  /* Item 9: never render a raw DB constant — every event type has a
     BN + EN label in EVENT_LABELS; unknown types are prettified. */
  var type=(ev.type||ev.event||'');
  var pl={}; try{pl=typeof ev.payload_json==='string'?JSON.parse(ev.payload_json||'{}'):(ev.payload||{});}catch(e){pl={};}
  var label=type?eventLabel(type):(ev.label||ev.title||'');
  /* Server-labelled events travel with labelEn/labelBn in the payload —
     prefer those over the dictionary (same wording, kept in sync). */
  if(pl&&(pl.labelBn||pl.labelEn))label=lang==='bn'?(pl.labelBn||pl.labelEn):(pl.labelEn||pl.labelBn);
  var when=ev.createdAt||ev.created_at||ev.at||ev.date||'';
  var det=eventDetail(ev)||(ev.note||ev.detail||'');
  /* P2: coloured node dots per event type (payment=orange, change=dark,
     confirmation=green). The newest card also enters highlighted. */
  var t=(ev.type||ev.event||'');
  var cls=/PAYMENT/.test(t)?'tl-pay':/CHANGE/.test(t)?'tl-change':/CONFIRM/.test(t)?'tl-confirm':'';
  return '<li class="'+cls+(ei===events.length-1?' tl-new':'')+'"><div class="when">'+esc(when?fmtDate(when):'')+' · '+esc(actorLabel(ev.actor))+'</div><div><b>'+esc(label)+'</b></div>'+(det?'<div class="small">'+esc(det)+'</div>':'')+'</li>';
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
     return '<figure class="cmp" style="grid-column:1/-1"><img src="'+esc(bu)+'" alt="'+(lang==='bn'?'আগের ছবি':'Before photo')+'" loading="lazy"><div class="cmp-after"><img src="'+esc(au)+'" alt="'+(lang==='bn'?'পরের ছবি':'After photo')+'" loading="lazy"></div><span class="cmp-tag before">'+esc(t('kind.before'))+'</span><span class="cmp-tag after">'+esc(t('kind.after'))+'</span><span class="cmp-handle" aria-hidden="true"></span><button type="button" class="cmp-expand" data-lightbox="'+esc(au)+'" data-alt="'+(lang==='bn'?'পরের ছবি':'After photo')+'" aria-label="'+(lang==='bn'?'ছবি বড় করে দেখুন':'Enlarge photo')+'">⤢</button><input type="range" min="2" max="98" value="50" aria-label="Before / after comparison slider"></figure>';
    }
    return g.map(function(p){
     var u=typeof p==='string'?p:(p.url||p.path||''); if(!u)return '';
     var kind=(p&&p.kind)||null;
     var when=(p&&(p.taken_at||p.takenAt||p.created_at||p.createdAt))||'';
     return '<figure class="photo"><img src="'+esc(u)+'" data-lightbox="'+esc(u)+'" data-alt="'+(lang==='bn'?'কাজের ছবি':'Job photo')+'" alt="'+(lang==='bn'?'কাজের ছবি':'Job photo')+'" loading="lazy">'+
      (kind?'<span class="pill '+(kind==='BEFORE'?'pill-grey':'pill-orange')+'">'+esc(kindLabel(kind))+'</span>':'')+
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
   return '<div class="cl-step" role="listitem"><div class="cl-ver">V'+vn+'</div><div class="cl-price">'+taka(v.price)+'</div><div class="mono grey">'+(v.deadline?fmtDate(v.deadline):'—')+'</div><div class="mono">'+(i===0?t('cl.agreed'):approved?t('cl.confirmed'):proposed?t('cl.proposed'):'—')+'</div></div>'+(i<versions.length-1?'<div class="cl-arrow" aria-hidden="true">→</div>':'');
  }).join('')+'</div>';
 }
 cl.innerHTML=(journey||'')+(versions.length?versions.map(function(v){
  return '<div class="notice"><b>V'+(v.version_no||v.version||'?')+' — '+taka(v.price)+'</b><div class="mono grey">'+(v.deadline?fmtDate(v.deadline):'—')+' · '+(v.fingerprint?('FP '+String(v.fingerprint).slice(0,12)+'…'):'')+'</div>'+(v.scope&&v.scope.scope?'<p>'+esc(v.scope.scope)+'</p>':'')+'</div>';
 }).join(''):'<p class="small">'+(lang==='bn'?'কোনো সংস্করণ নেই।':'No versions yet.')+'</p>');
 /* Payment acknowledgement is pre-filled with the remaining balance:
    the hirer taps a method and records — no re-typing the amount. */
 var payAmt=$('pay-amount');
 if(payAmt&&document.activeElement!==payAmt&&rem>0)payAmt.value=rem;
 /* The pre-filled amount is a tappable chip — a partial payment is a
    deliberate tap on it, not an accident of the pre-fill. */
 var payChip=$('pay-full-chip');
 if(payChip){payChip.textContent=t('pay.fullRem').replace('{amt}',taka(rem));payChip.hidden=!(rem>0);}
 var payConf=$('pay-confirm');
 if(payConf)payConf.hidden=true;
 var pcf2=$('btn-pay-confirm'); if(pcf2)pcf2.disabled=false;
 var formPayEl=$('form-pay');
 /* P2-7: draft-state UX — before both sides confirm, live location and
    payments are not open yet, and ChangeLock is locked. The record
    itself (timeline, payment history, receipt) stays visible; only the
    actions that need an ACTIVE record are gated. The API rules are
    untouched: payments/changes still 409 on DRAFT (regression-checked).
    On a DRAFT the share-trip button itself is hidden — the worker
    starts sharing from their link. */
 var isActive=job.status==='ACTIVE';
 var locEmpty=$('loc-empty'); if(locEmpty)locEmpty.hidden=isActive;
 var stBtn2=$('btn-share-trip'); if(stBtn2)stBtn2.hidden=!isActive;
 var payLocked=$('pay-locked'); if(payLocked)payLocked.hidden=isActive;
 if(formPayEl)formPayEl.hidden=!isActive;
 applyMoreLocks(job);
 renderMoreResolvePack();
 /* Receipt card: the latest payment in ANY state (acknowledged,
    awaiting or disputed), with a status pill — so the hirer always sees
    what the last payment stands at. It reuses the record data — no new
    service, no new claim. */
 var rc=$('receipt-card');
 if(rc){
  var last=(pays||[]).length?pays[pays.length-1]:null;
  if(last){
   /* The receipt moves to the top of step 4, before the payment form. */
   var tabS4=$('tab-s4'), formPay=$('form-pay');
   if(tabS4&&formPay)tabS4.insertBefore(rc,formPay);
   var fp8=(evd&&evd.fingerprint8)||(versions.length&&versions[versions.length-1].fingerprint?String(versions[versions.length-1].fingerprint).slice(0,8):'');
   var mtxt=last.method==='Cash'?(lang==='bn'?'নগদ':'Cash'):(last.method||'');
   var ackLab=statusLabel(last.ack_status||'AWAITING');
   var wName=pick(job,['workerName','worker_name'])||'—';
   rc.hidden=false;
   if(!RM){rc.classList.remove('card-pop');void rc.offsetWidth;rc.classList.add('card-pop');}
   rc.innerHTML='<h4>'+esc(t('receipt.title'))+' <span class="pill '+(last.ack_status==='ACKNOWLEDGED'?'pill-orange':'pill-grey')+'">'+esc(ackLab)+'</span></h4>'
    +'<div class="rc-row"><span>'+(lang==='bn'?'টাকা':'Amount')+'</span><b>'+taka(last.amount)+'</b></div>'
    +'<div class="rc-row"><span>'+(lang==='bn'?'মাধ্যম':'Method')+'</span><b>'+esc(mtxt)+'</b></div>'
    +'<div class="rc-row"><span>'+(lang==='bn'?'তারিখ':'Date')+'</span><b>'+esc(fmtDate(last.date||last.createdAt||last.created_at))+'</b></div>'
    +'<div class="rc-row"><span>'+esc(t('receipt.trade'))+'</span><b>'+esc(tradeLabel(job.trade))+'</b></div>'
    +'<div class="rc-row"><span>'+esc(t('receipt.worker'))+'</span><b>'+esc(wName)+'</b></div>'
    +(fp8?'<div class="rc-row"><span><a href="#" id="btn-receipt-verify">'+esc(t('receipt.fpVerify'))+'</a></span><b class="mono">'+esc(fp8)+'…</b></div>':'')
    +'<p class="small">'+esc(t('receipt.holdsNoMoney'))+'</p>'
    +'<div class="btn-row"><button class="btn btn-dark-ghost btn-sm" type="button" id="btn-receipt-copy">'+esc(t('receipt.copy'))+'</button><button class="btn btn-dark-ghost btn-sm" type="button" id="btn-receipt-share">'+esc(t('receipt.share'))+'</button><button class="btn btn-dark-ghost btn-sm" type="button" id="btn-receipt-print">'+esc(t('receipt.print'))+'</button></div>';
   var receiptText=function(){
    return 'DealCraft '+(lang==='bn'?'রসিদ':'receipt')+' — '+taka(last.amount)+' · '+mtxt+' · '+fmtDate(last.date||last.createdAt||last.created_at)+(fp8?' · FP '+fp8:'');
   };
   var rcb=$('btn-receipt-copy');
   if(rcb)rcb.addEventListener('click',function(){
    var txt=receiptText();
    function done(){showNotice(t('receipt.copied'));}
    if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(txt).then(done,function(){showNotice(txt);});
    else showNotice(txt);
   });
   var rsb=$('btn-receipt-share');
   if(rsb)rsb.addEventListener('click',function(){
    var txt=receiptText();
    if(navigator.share)navigator.share({text:txt}).then(function(){showNotice(t('receipt.shared'));},function(){});
    else if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(txt).then(function(){showNotice(t('receipt.copied'));});
    else showNotice(txt);
   });
   var rpb=$('btn-receipt-print');
   if(rpb)rpb.addEventListener('click',function(){window.print();});
   var rfv=$('btn-receipt-verify');
   if(rfv)rfv.addEventListener('click',function(ev){
    ev.preventDefault();
    var vb=$('btn-evidence-verify');
    if(vb)vb.click();
    else window.open('/verify','_blank');
   });
  }else rc.hidden=true;
 }
 /* payments — rows use ack_status: AWAITING / ACKNOWLEDGED / DISPUTED */
 var pl=$('pay-list');
 pl.innerHTML=pays.length?pays.map(function(p){
  var ack=p.ack_status==='ACKNOWLEDGED';
  var ackLab=ack?t('pay.ack'):t('pay.awaiting');
  var method=p.method==='Cash'?(lang==='bn'?'নগদ':'Cash'):(p.method||'');
  return '<div class="job-row"><div><div class="t">'+taka(p.amount)+'</div><div class="m">'+esc(method)+' · '+fmtDate(p.date||p.createdAt||p.created_at)+' · '+esc(ackLab)+'</div></div><span class="pill '+(ack?'pill-orange':'pill-grey')+'">'+esc(ackLab)+'</span></div>';
 }).join(''):'<p class="small">'+(lang==='bn'?'কোনো পেমেন্ট রেকর্ড নেই।':'No payments recorded yet.')+'</p>';
 /* milestones — Complete is a worker action (worker page); hirer only approves */
 var ml=$('miles-list');
 ml.innerHTML=miles.length?miles.map(function(m,i){
  var done=m.completed||m.status==='COMPLETE'||m.status==='COMPLETED';
  var appr=m.approved||m.status==='APPROVED';
  /* Approve is live only once the worker has marked the step done —
     before that the button says so and stays disabled. */
  return '<div class="job-row"><div><div class="t">'+esc(m.title?msTitleLabel(m):(t('ms.title')+' '+(i+1)))+'</div><div class="m">'+taka(m.amount)+' · '+(appr?t('ms.approved'):done?t('ms.completeWait'):t('ms.pending'))+'</div></div><div style="display:flex;gap:8px"><button class="btn btn-dark btn-sm" type="button" data-ms-approve="'+i+'" '+((appr||!done)?'disabled':'')+'>'+esc(appr?t('ms.approved'):done?(lang==='bn'?'অনুমোদন':'Approve'):t('ms.waiting'))+'</button></div></div>';
 }).join(''):'<p class="small">'+(lang==='bn'?'কোনো মাইলস্টোন নেই।':'No milestones.')+'</p>';
 ml.querySelectorAll('[data-ms-approve]').forEach(function(b){b.addEventListener('click',async function(){try{await api('/api/jobs/'+encodeURIComponent(currentJobId)+'/milestones/'+b.getAttribute('data-ms-approve')+'/approve',{method:'POST',body:'{}'});openJob(currentJobId);}catch(e){showErr(e.message);}});});
 /* disputes — statement text lives in d.statements[] */
 var dl=$('dispute-list');
 dl.innerHTML=disputes.length?disputes.map(function(d){
  var stmts=(d.statements||[]).map(function(s){return '<div class="small"><b>'+esc(actorLabel(s.side))+':</b> '+esc(s.text||'')+'</div>';}).join('');
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
      ?(lang==='bn'?'ওয়ার্কার প্রস্তাবটি মেনে নিয়েছে — সমাধান হয়েছে।':'The worker accepted the proposal — resolved.')
      :proposed
      ?(lang==='bn'?'প্রস্তাব পাঠানো হয়েছে — ওয়ার্কার মানলে তবেই সমাধান হবে।':'Proposal sent — it resolves only if the worker accepts it.')
      :(lang==='bn'?'দুই পক্ষের বক্তব্য থাকলেই প্রস্তাব দেওয়া যায়। ওয়ার্কার মানলে তবেই সমাধান হবে — DealCraft কোনো রায় দেয় না।':'Both sides must have a statement first. It resolves only if the worker accepts — DealCraft never decides.'))+'</p>':'';
  var catLab=DISPUTE_CAT_LABELS[d.category]?DISPUTE_CAT_LABELS[d.category][lang]||DISPUTE_CAT_LABELS[d.category].en:prettifyConst(d.category||'Dispute');
  return '<div class="notice"><b>'+esc(catLab)+'</b><div class="mono grey">'+esc(statusLabel(d.status||'OPEN'))+'</div>'+stmts+res+'</div>';
 }).join(''):'<p class="small">'+(lang==='bn'?'কোনো বিরোধ নেই।':'No disputes.')+'</p>';
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

/* ---------- share live trip (Uber-style link, no login for the viewer) ---------- */
async function shareTrip(){
 if(!currentJobId)return;
 clearErr(); clearNotice();
 try{
  var r=await api('/api/jobs/'+encodeURIComponent(currentJobId)+'/share-trip',{method:'POST',body:'{}'});
  var url=r&&(r.url||r.tripUrl||r.link)||'';
  if(!url)throw new Error('no trip link returned');
  var full=url.indexOf('http')===0?url:(location.origin+url);
  var note=$('trip-link-note'), linkEl=$('trip-link-url');
  if(note){note.hidden=false;}
  if(linkEl){linkEl.textContent=t('trip.linkLabel');linkEl.href=full;}
  /* The note says exactly what the link exposes — and the button rests
     for 10s so a double tap cannot mint a second trip. */
  var nt=$('trip-link-note-text'); if(nt)nt.textContent=t('trip.copiedNote');
  var stBtn=$('btn-share-trip');
  if(stBtn){stBtn.disabled=true;setTimeout(function(){stBtn.disabled=false;},10000);}
  if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(full).then(function(){showNotice(t('trip.copied'));},function(){showNotice(t('trip.linkReady'));});}
  else showNotice(t('trip.linkReady'));
 }catch(e){
  /* The endpoint lands with the other workstreams: a 404 means this
     server does not have it yet — say so plainly, never fake a link. */
  showNotice(t('trip.unavailable'));
 }
}

/* ---------- billing status ---------- */
var billingCache=null, feePaidForJob={};
async function loadBillingStatus(){
 var box=$('billing-status'); if(!box)return;
 var fees='<p class="mono">৳10 / '+(lang==='bn'?'রেকর্ড':'record')+' · ৳70 / '+(lang==='bn'?'মাস':'month')+'</p>';
 try{var d=await api('/api/billing/status');
  billingCache=d;
  /* Response shape is not fixed yet — read it tolerantly, never invent a status. */
  var sub=d.subscription||d.sub||{};
  var active=sub.active===true||sub.status==='ACTIVE'||d.subscribed===true||d.activeSubscription===true||d.subscriptionActive===true;
  var paid=d.paidJobs!=null?d.paidJobs:(d.jobs&&d.jobs.paid!=null?d.jobs.paid:(d.paid!=null?d.paid:'—'));
  var unpaid=d.unpaidJobs!=null?d.unpaidJobs:(d.jobs&&d.jobs.unpaid!=null?d.jobs.unpaid:(d.unpaid!=null?d.unpaid:'—'));
  /* R5a: the ৳10 record fee for this job — paid means the Pay button
     goes away and the paid pill shows instead. Read the server state,
     in order: (1) job-detail fee.paid (GET /api/jobs/:id — primary,
     survives a refresh and a fee paid on another device), (2) the
     matching jobs[] entry's feePaid in this billing-status response.
     The in-memory flag from this session's own verify tap is a
     fallback only — it never overrides a server paid:false.
     Read-only: no charge is created from reading this field. */
  var jobFee=(currentJob&&currentJob._full&&currentJob._full.fee)||(currentJob&&currentJob.fee)||null;
  var serverFeePaid=jobFee?(jobFee.paid===true?true:(jobFee.paid===false?false:null)):null;
  var billedJob=null;
  if(d.jobs&&Array.isArray(d.jobs)){for(var bi=0;bi<d.jobs.length;bi++){if(d.jobs[bi]&&d.jobs[bi].jobId===currentJobId){billedJob=d.jobs[bi];break;}}}
  var billedFeePaid=billedJob?(billedJob.feePaid===true?true:(billedJob.feePaid===false?false:null)):null;
  var feePaid=serverFeePaid===true||billedFeePaid===true||(serverFeePaid!==false&&billedFeePaid!==false&&feePaidForJob[currentJobId]===true);
  var caasBtn=$('btn-caas'), paidPill=$('caas-paid-pill');
  if(caasBtn)caasBtn.hidden=!!feePaid;
  if(paidPill)paidPill.hidden=!feePaid;
  var unsubBtn=$('btn-unsub'); if(unsubBtn)unsubBtn.hidden=!active;
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

/* ---------- worker "My jobs" (hirer jobs and worker jobs, separate) ---------- */
async function loadWorkerJobs(){
 var list=$('worker-jobs-list'); if(!list)return;
 list.innerHTML='<p class="mono grey">'+esc(t('job.loading'))+'</p>';
 $('worker-jobs-empty').hidden=true; $('worker-jobs-note').hidden=true;
 try{
  var r=await api('/api/worker/jobs'); var jobs=Array.isArray(r)?r:(r.jobs||r.data||[]);
  workerJobsCache=jobs; workerJobsResp=r; renderWorkerJobs();
 }catch(e){
  /* M3: hide both the empty state and the note, clear the list, say
     plainly what happened, and offer one-tap Retry. */
  workerJobsCache=[]; workerJobsResp=null;
  list.innerHTML='<button type="button" class="btn btn-dark btn-sm" id="worker-jobs-retry">'+esc(t('jobs.retry'))+'</button>';
  $('worker-jobs-empty').hidden=true; $('worker-jobs-note').hidden=true;
  showErr(t('jobs.workerErr'));
  var rb=$('worker-jobs-retry'); if(rb)rb.addEventListener('click',loadWorkerJobs);
 }
}
function initJobsTabs(){
 var h=$('jobs-tab-hirer'), w=$('jobs-tab-worker'); if(!h||!w)return;
 h.addEventListener('click',function(){
  h.setAttribute('aria-selected','true'); w.setAttribute('aria-selected','false');
  $('jobs-hirer-pane').hidden=false; $('jobs-worker-pane').hidden=true; loadJobs(); });
 w.addEventListener('click',function(){
  w.setAttribute('aria-selected','true'); h.setAttribute('aria-selected','false');
  $('jobs-hirer-pane').hidden=true; $('jobs-worker-pane').hidden=false; loadWorkerJobs(); });
 wireFilter('jobs-filter-hirer',function(f){jobsFilter=f;},renderHirerJobs);
 wireFilter('jobs-filter-worker',function(f){workerJobsFilter=f;},renderWorkerJobs);
}
function wireFilter(containerId,setF,render){
 var c=$(containerId); if(!c)return;
 c.querySelectorAll('button[data-filter]').forEach(function(b){
  b.addEventListener('click',function(){
   setF(b.getAttribute('data-filter'));
   c.querySelectorAll('button[data-filter]').forEach(function(x){x.setAttribute('aria-pressed',x===b?'true':'false');});
   render();
  });
 });
}

/* ---------- prompt-based job creation ---------- */
/* One line in, parsed instantly on the phone (DealCraftPrompt, when the
   parser module is present; a small built-in fallback covers trade +
   price + deadline words when it is not). Whatever is missing is asked
   ONE question at a time, chat-style — never a wall of fields. FairScope
   is the same chat (see renderFairScope); milestones are one-tap
   suggestions. No new dependencies, no network calls, no AI. */
var parseFailNoticed=false;
function parsePromptSafe(text){
 /* N4c: the parser module itself failed to load — never guess from the
    line. Show one notice and queue all four questions instead. */
 if(!window.DealCraftPrompt||typeof window.DealCraftPrompt.parsePrompt!=='function'){
  if(!parseFailNoticed){parseFailNoticed=true;showNotice(t('prompt.parseFail'));}
  return {trade:null,price:null,deadline:null,deadlineText:null,description:'',scope:'',missing:['trade','price','deadline','description']};
 }
 try{
  var r=window.DealCraftPrompt.parsePrompt(text||'');
  if(r&&typeof r==='object')return r;
 }catch(e){}
 /* Built-in fallback (the parser threw or returned nothing): a
    currency-marked number wins at any size; otherwise the largest bare
    number of 100 or more ("2 bedroom" is never a price). A bare mistri
    says nothing about the trade — no ELECTRICIAN default. */
 var t=String(text||'');
 var low=t.toLowerCase();
 var trade=null;
 if(/electric|ইলেকট্রিশ|rewir|রিওয়্যার|wiring|ওয়্যারিং|socket|সকেট/.test(low))trade='ELECTRICIAN';
 else if(/paint|রং|রঙ|colour|color/.test(low))trade='PAINTER';
 else if(/plumb|প্লাম্বার|পাইপ|pipe|leak|লিক|tap|কল/.test(low))trade='PLUMBER';
 var bnMap={'০':'0','১':'1','২':'2','৩':'3','৪':'4','৫':'5','৬':'6','৭':'7','৮':'8','৯':'9'};
 function numVal(s){return Number(s.replace(/[০-৯]/g,function(c){return bnMap[c];}).replace(/,/g,''));}
 var price=null;
 var numRe=/[০-৯0-9][০-৯0-9,]*(?:\.[0-9]+)?/g, hit;
 while((hit=numRe.exec(t))!==null){
  var around=(t.slice(Math.max(0,hit.index-8),hit.index)+' '+t.slice(hit.index+hit[0].length,hit.index+hit[0].length+8)).toLowerCase();
  if(/৳|টাকা|taka|bdt|\btk\b/.test(around)){price=numVal(hit[0]);break;}
  var v=numVal(hit[0]);
  if(v>=100&&(price==null||v>price))price=v;
 }
 var deadline=null, deadlineText=null;
 var dm=t.match(/(20\d\d-\d\d-\d\d)/);
 if(dm){deadline=dm[1];deadlineText=dm[1];}
 var missing=[];
 if(!trade)missing.push('trade');
 if(price==null)missing.push('price');
 if(!deadline)missing.push('deadline');
 if(!t.trim())missing.push('description');
 return {trade:trade,price:price,deadline:deadline,deadlineText:deadlineText,description:t.trim(),scope:t.trim(),missing:missing};
}
/* N3: every chip is a button. Tapping a filled chip re-asks that one
   question with the current value pre-filled; tapping a "Need:" chip
   asks that missing question. After the answer, the prompt text is
   rebuilt with the corrected value, re-parsed, and the chips re-render. */
var CHIP_QUESTIONS={
 trade:{text:function(){return lang==='bn'?'কোন কাজ? ইলেকট্রিশিয়ান, পেইন্টার, নাকি প্লাম্বার?':'Which trade — electrician, painter, or plumber?';},ph:function(){return lang==='bn'?'যেমন: ইলেকট্রিশিয়ান':'e.g. electrician';},input:'text'},
 price:{text:function(){return lang==='bn'?'দাম কত ঠিক হয়েছে? (৳)':'What price did you agree? (৳)';},ph:function(){return '18000';},input:'number'},
 deadline:{text:function(){return lang==='bn'?'কবে শেষ করতে হবে?':'By when?';},ph:function(){return '';},input:'date'},
 scope:{text:function(){return lang==='bn'?'কাজটা কী? এক লাইনে বলুন।':'What is the work? One line.';},ph:function(){return lang==='bn'?'যেমন: পুরো ফ্ল্যাটের রিওয়্যারিং':'e.g. full flat rewiring';},input:'text'}
};
function promptChips(el,parsed){
 if(!el)return;
 var parts=[];
 function chip(key,label,filled){parts.push({key:key,label:label,filled:filled});}
 if(parsed.trade)chip('trade',tradeLabel(parsed.trade),true);
 if(parsed.price!=null)chip('price',taka(parsed.price),true);
 if(parsed.deadline)chip('deadline',parsed.deadlineText||parsed.deadline,true);
 /* P2-9: the scope chip shows the parsed scope (line minus price and
    deadline — "2 bedroom flat rewiring"), not the stored description
    ("2 bedroom flat"). */
 var chipScope=parsed.scope||parsed.description;
 if(chipScope)chip('scope',chipScope.slice(0,40),true);
 (parsed.missing||[]).forEach(function(m){
  chip(m,(lang==='bn'?'দরকার: ':'Need: ')+(m==='trade'?(lang==='bn'?'কাজের ধরন':'trade'):m==='price'?(lang==='bn'?'দাম':'price'):m==='deadline'?(lang==='bn'?'শেষ তারিখ':'deadline'):(lang==='bn'?'বিবরণ':'description')),false);
 });
 el.hidden=!parts.length;
 el.innerHTML='';
 parts.forEach(function(p){
  var b=document.createElement('button');
  b.type='button'; b.className='chip'+(p.filled?'':' miss');
  b.style.minHeight='44px';
  b.textContent=p.label;
  b.setAttribute('data-chip',p.key);
  b.addEventListener('click',function(){reaskChip(el,p.key,parsed);});
  el.appendChild(b);
 });
}
function rebuildPromptText(parsed,key,v){
 var tr=key==='trade'?(parsePromptSafe(v).trade||parsed.trade):parsed.trade;
 var pr=key==='price'?(Number(String(v).replace(/[^0-9]/g,''))||parsed.price):parsed.price;
 var dl=key==='deadline'?(v||parsed.deadline):parsed.deadline;
 var ds=(key==='scope'||key==='description')?(v||parsed.description):parsed.description;
 var out=[];
 if(ds)out.push(ds);
 if(tr)out.push(String(tr).toLowerCase());
 if(pr!=null)out.push(String(pr));
 if(dl)out.push(dl);
 return out.join(', ');
}
function reaskChip(el,key,parsed){
 /* The bid prompt has no chat-question UI — focus its line for editing. */
 if(el&&el.id==='bid-prompt-chips'){var bp=$('bid-prompt');if(bp)bp.focus();return;}
 var qk=(key==='description')?'scope':key;
 var qdef=CHIP_QUESTIONS[qk]; if(!qdef)return;
 var cur='';
 if(qk==='trade')cur=parsed.trade?parsed.trade.toLowerCase():'';
 else if(qk==='price')cur=parsed.price!=null?String(parsed.price):'';
 else if(qk==='deadline')cur=parsed.deadline||'';
 else cur=parsed.description||'';
 /* Landing chips re-ask inside the new-job flow (its chips are the ones
    on screen); the app chips re-ask in place. */
 var targetEl=el, targetInput=$('prompt-input-app');
 if(el.id==='prompt-chips'){targetEl=$('prompt-chips-app');}
 var single={key:qk,text:qdef.text(),input:qdef.input,ph:qdef.ph(),value:cur,
  onAnswer:function(v){
   var newText=rebuildPromptText(parsed,qk,v);
   var li=$('prompt-input'); if(li)li.value=newText;
   if(targetInput)targetInput.value=newText;
   if(targetInput)autogrow(targetInput);
   var np=parsePromptSafe(newText);
   draft.parsed=np;
   if(np.trade)switchTrade(np.trade);
   if(np.price!=null){var jp=$('job-price');if(jp)jp.value=np.price;suggestMilestones(np.price);}
   if(np.deadline){var jd=$('job-deadline');if(jd)jd.value=np.deadline;}
   if(np.scope||np.description){var js=$('job-scope');if(js)js.value=np.scope||np.description;}
   promptChips(targetEl,np);
   renderNewSummary();
  }};
 if(el.id==='prompt-chips'){
  if(!token){startHire('direct');return;}
  startHire('direct');
  promptQ=[single].concat(promptQ||[]);
  nextPromptQuestion();
  return;
 }
 promptQ=[single].concat(promptQ||[]);
 nextPromptQuestion();
}
var promptQ=null; /* [{key, text, input, onAnswer, optional}] */
function askPromptQuestions(queue){
 promptQ=queue||[];
 nextPromptQuestion();
}
function nextPromptQuestion(){
 var box=$('prompt-q'); if(!box)return;
 var q=promptQ&&promptQ.length?promptQ[0]:null;
 if(!q){box.hidden=true;return;}
 box.hidden=false;
 $('prompt-q-text').textContent=q.text;
 var inp=$('prompt-q-input');
 inp.value=q.value!=null?q.value:'';
 inp.type=q.input==='tel'?'tel':q.input==='date'?'date':q.input==='number'?'number':'text';
 inp.placeholder=q.ph||'';
 $('prompt-q-skip').style.display=q.optional?'':'none';
 inp.focus();
}
function answerPromptQuestion(){
 if(!promptQ||!promptQ.length)return;
 var q=promptQ[0];
 var v=$('prompt-q-input').value.trim();
 if(!v&&!q.optional){$('prompt-q-input').focus();return;}
 promptQ.shift();
 if(q.onAnswer)q.onAnswer(v);
 nextPromptQuestion();
 saveDraft(); maybeRevealDetails();
}
/* The one-question-at-a-time queue for whatever the prompt did not
   contain. `known` skips the worker questions on draft restore, when
   the worker is already known. */
function promptQuestionQueue(parsed,known){
 known=known||{};
 var queue=[];
 if(!parsed.trade)queue.push({key:'trade',text:lang==='bn'?'কোন কাজ? ইলেকট্রিশিয়ান, পেইন্টার, নাকি প্লাম্বার?':'Which trade — electrician, painter, or plumber?',ph:lang==='bn'?'যেমন: ইলেকট্রিশিয়ান':'e.g. electrician',onAnswer:function(v){
   var tr=parsePromptSafe(v).trade||(/paint|রং/.test(v)?'PAINTER':/plumb|পাইপ/.test(v)?'PLUMBER':null);
   if(tr)switchTrade(tr);}});
 if(parsed.price==null)queue.push({key:'price',text:lang==='bn'?'দাম কত ঠিক হয়েছে? (৳)':'What price did you agree? (৳)',input:'number',ph:'18000',onAnswer:function(v){var n=Number(v.replace(/[^0-9]/g,''));if(n>0){$('job-price').value=n;suggestMilestones(n);}}});
 if(!parsed.deadline)queue.push({key:'deadline',text:lang==='bn'?'কবে শেষ করতে হবে?':'By when?',input:'date',onAnswer:function(v){if(v)$('job-deadline').value=v;}});
 if(!parsed.description)queue.push({key:'scope',text:lang==='bn'?'কাজটা কী? এক লাইনে বলুন।':'What is the work? One line.',ph:lang==='bn'?'যেমন: পুরো ফ্ল্যাটের রিওয়্যারিং':'e.g. full flat rewiring',onAnswer:function(v){if(v)$('job-scope').value=v;}});
 if(!known.workerPhone)queue.push({key:'workerPhone',text:lang==='bn'?'ওয়ার্কারের ফোন নম্বর কী?':'What is the worker’s phone number?',input:'tel',ph:'01XXXXXXXXX',onAnswer:function(v){$('worker-phone').value=v;updateWorkerSummary();}});
 if(!known.workerName)queue.push({key:'workerName',text:lang==='bn'?'ওয়ার্কারের নাম কী? (না জানলে বাদ দিন)':'What is the worker’s name? (skip if unknown)',optional:true,ph:lang==='bn'?'ওয়ার্কারের নাম':'Worker name',onAnswer:function(v){$('worker-name').value=v;updateWorkerSummary();}});
 return queue;
}
function startPromptFlow(text){
 var parsed=parsePromptSafe(text||'');
 draft=freshDraft(parsed.trade||'ELECTRICIAN');
 draft.parsed=parsed;
 syncTradePicker();
 if(parsed.price!=null)$('job-price').value=parsed.price;
 if(parsed.deadline)$('job-deadline').value=parsed.deadline;
 /* P2-9: the scope field carries the parsed scope ("2 bedroom flat
    rewiring"), not the stored description ("2 bedroom flat"). */
 if(parsed.scope||parsed.description)$('job-scope').value=parsed.scope||parsed.description;
 promptChips($('prompt-chips-app'),parsed);
 $('fs-chat').hidden=false;
 renderFairScope();
 /* Ask only what the prompt did not contain — one at a time. The
    details stay hidden until the questions AND FairScope are done. */
 askPromptQuestions(promptQuestionQueue(parsed));
 if(parsed.price!=null)suggestMilestones(parsed.price);
 maybeRevealDetails();
}
/* N6a: reopening view-new restores an unfinished job instead of
   starting over. Returns true when a draft was restored. */
function restoreDraft(){
 var raw=null; try{raw=localStorage.getItem('dc_draft');}catch(e){}
 if(!raw)return false;
 var saved=null; try{saved=JSON.parse(raw);}catch(e){return false;}
 if(!saved||!saved.draft)return false;
 var d=saved.draft, f=saved.fields||{};
 draft=d;
 if(!draft.answersByTrade)draft.answersByTrade={ELECTRICIAN:{},PAINTER:{},PLUMBER:{}};
 if(!draft.skippedByTrade)draft.skippedByTrade={ELECTRICIAN:[],PAINTER:[],PLUMBER:[]};
 if(!draft.answers)draft.answers={};
 if(!draft.skipped)draft.skipped=[];
 if(draft.fsIndex==null)draft.fsIndex=0;
 if(!draft.trade||!FAIRSCOPE[draft.trade])draft.trade='ELECTRICIAN';
 var ai=$('prompt-input-app'); if(ai){ai.value=f.promptText||'';autogrow(ai);}
 var jp=$('job-price'); if(jp)jp.value=f.price||'';
 var jd=$('job-deadline'); if(jd)jd.value=f.deadline||'';
 var js=$('job-scope'); if(js)js.value=f.scope||'';
 var wp=$('worker-phone'); if(wp)wp.value=f.workerPhone||'';
 var wn=$('worker-name'); if(wn)wn.value=f.workerName||'';
 if(f.site)draft.site=f.site;
 updateWorkerSummary();
 syncTradePicker();
 var chipParsed={trade:(draft.parsed&&draft.parsed.trade)||null,price:f.price?Number(f.price):null,deadline:f.deadline||null,deadlineText:f.deadline||null,description:f.scope||'',scope:f.scope||'',missing:[]};
 if(!chipParsed.trade)chipParsed.missing.push('trade');
 if(chipParsed.price==null)chipParsed.missing.push('price');
 if(!chipParsed.deadline)chipParsed.missing.push('deadline');
 if(!chipParsed.description)chipParsed.missing.push('description');
 promptChips($('prompt-chips-app'),chipParsed);
 $('fs-chat').hidden=false;
 renderFairScope();
 var rp={trade:(draft.parsed&&draft.parsed.trade)||null,price:f.price?Number(f.price):null,deadline:f.deadline||null,description:f.scope||null};
 var q=promptQuestionQueue(rp,{workerPhone:!!f.workerPhone,workerName:!!f.workerName});
 if(q.length)askPromptQuestions(q);
 maybeRevealDetails();
 if(f.price)suggestMilestones(Number(f.price));
 showNotice(t('draft.restored'));
 return true;
}
function resetNewJobForm(){
 draft=freshDraft('ELECTRICIAN');
 var ai=$('prompt-input-app'); if(ai){ai.value='';autogrow(ai);}
 $('prompt-chips-app').hidden=true;
 $('fs-chat').hidden=true; $('new-details').hidden=true; $('prompt-q').hidden=true;
 $('job-price').value=''; $('job-deadline').value=''; $('job-scope').value='';
 $('worker-phone').value=''; $('worker-name').value=''; $('review-record').innerHTML='';
 var ns=$('new-summary'); if(ns)ns.innerHTML='';
 promptQ=null;
 updateWorkerSummary();
 syncTradePicker();
 renderFairScope();
}
function suggestMilestones(price){
 var box=$('ms-suggest'); if(!box||!(price>0))return;
 var a=Math.round(price*0.28), b=Math.round(price*0.39), c=price-a-b;
 var sets=[
  {label:(lang==='bn'?'সাধারণ ভাগ: ':'Usual split: ')+taka(a)+' / '+taka(b)+' / '+taka(c),vals:[['Advance',a],['First stage',b],['Completion',c]]},
 ];
 box.innerHTML=sets.map(function(st,i){return '<button class="btn btn-dark-ghost btn-sm" type="button" data-ms-set="'+i+'">'+esc(st.label)+'</button>';}).join('');
 box.querySelectorAll('[data-ms-set]').forEach(function(btn){btn.addEventListener('click',function(){
  var st=sets[+btn.getAttribute('data-ms-set')];
  var rows=$('milestone-rows');
  rows.innerHTML=st.vals.map(function(v){return '<div class="field-grid"><div><input type="text" class="ms-title" value="'+esc(v[0])+'"></div><div><input type="number" class="ms-amount" min="0" inputmode="numeric" value="'+v[1]+'"></div></div>';}).join('');
 });});
}
function buildReview(){
 var qs=FAIRSCOPE[draft.trade]||[];
 var answers={}; qs.forEach(function(q,i){answers[q.q.en]=draft.answers[i]||'Not decided';});
 var miles=[]; document.querySelectorAll('#milestone-rows .field-grid').forEach(function(r){
  var ti=r.querySelector('.ms-title').value.trim(), am=r.querySelector('.ms-amount').value;
  if(ti){var mk=msKeyForTitle(ti);miles.push(mk?{title:ti,amount:am?Number(am):0,key:mk}:{title:ti,amount:am?Number(am):0});} });
 draft.payload={trade:draft.trade,workerPhone:$('worker-phone').value.trim(),workerName:$('worker-name').value.trim(),
  scope:$('job-scope').value.trim(),price:Number($('job-price').value)||0,deadline:$('job-deadline').value,
  milestones:miles,answers:answers,skippedTerms:draft.skipped.slice(),
  site:draft.site?{lat:draft.site.lat,lng:draft.site.lng,address:$('site-address').value.trim()||draft.site.address||''}:undefined};
 var miss=missingTerms();
 $('review-record').innerHTML='<h3>'+esc(tradeLabel(draft.trade))+' — '+(lang==='bn'?'এক পাতার কাজের রেকর্ড':'One-page work record')+'</h3><table>'+
  '<tr><th>'+(lang==='bn'?'ওয়ার্কার':'Worker')+'</th><td>'+esc(draft.payload.workerName||'')+' · '+esc(draft.payload.workerPhone)+'</td></tr>'+
  '<tr><th>'+(lang==='bn'?'দাম':'Price')+'</th><td>'+taka(draft.payload.price)+'</td></tr>'+
  '<tr><th>'+(lang==='bn'?'শেষ তারিখ':'Deadline')+'</th><td>'+esc(draft.payload.deadline||'—')+'</td></tr>'+
  '<tr><th>'+(lang==='bn'?'বিবরণ':'Scope')+'</th><td>'+esc(draft.payload.scope||'—')+'</td></tr>'+
  qs.map(function(q,i){var v=draft.answers[i]||'Not decided';
   var disp=v==='Not decided'?NOT_DECIDED[lang]:(function(){var ix=q.opts.en.indexOf(v);return ix>=0?(q.opts[lang]||q.opts.en)[ix]:v;})();
   return '<tr><th>'+esc(q.q[lang]||q.q.en)+'</th><td>'+esc(disp)+'</td></tr>';}).join('')+
  (miss.length?'<tr><th>'+(lang==='bn'?'ঠিক হয়নি':'Not decided')+'</th><td style="color:#c23c00">'+miss.map(function(m){var qq=qs.filter(function(x){return x.q.en===m;})[0];return esc(qq?(qq.q[lang]||qq.q.en):m);}).join(', ')+'</td></tr>':'')+
  (draft.skipped.length?'<tr><th>'+(lang==='bn'?'বাদ দেওয়া (ইচ্ছাকৃত)':'Explicitly skipped')+'</th><td>'+draft.skipped.map(function(m){var qq=qs.filter(function(x){return x.q.en===m;})[0];return esc(qq?(qq.q[lang]||qq.q.en):m);}).join(', ')+'</td></tr>':'')+
  '</table>';
 renderNewSummary();
 return draft.payload;
}
/* P2-9(d): "Get bids" first explains bidding — what it is, how it works,
   what happens next ("A bid alone is never an agreement", dual OTP, one
   ৳10 fee, then ACTIVE) — before the bid-post form. Logged-out visitors
   go to login first, with the pending hire stashed like startHire. */
function showBidInfo(){
 if(!BIDDING_ON){showNotice(lang==='bn'?'দর এখন বন্ধ আছে।':'Bidding is off right now.');return;}
 if(!token){
  var text=''; var landing=$('prompt-input');
  if(landing&&landing.value.trim())text=landing.value.trim();
  try{localStorage.setItem('dc_pending_hire','bids');if(text)localStorage.setItem('dc_pending_prompt',text);}catch(e){}
  showView('view-login'); return;
 }
 showView('view-bid-info');
}
function startHire(mode){
 var text='';
 var landing=$('prompt-input');
 if(landing&&landing.value.trim())text=landing.value.trim();
 var appInp=$('prompt-input-app');
 if(!text&&appInp&&appInp.value.trim())text=appInp.value.trim();
 if(!text){try{text=localStorage.getItem('dc_pending_prompt')||'';localStorage.removeItem('dc_pending_prompt');}catch(e){}}
 if(!token){
  try{localStorage.setItem('dc_pending_hire',mode);if(text)localStorage.setItem('dc_pending_prompt',text);}catch(e){}
  showView('view-login'); return;
 }
 /* P2-9(d): bidding goes through the explanatory screen first. The
    landing prompt text rides along and lands in the bid-post form when
    the visitor taps Continue. */
 if(mode==='bids'){pendingBidText=text||'';showBidInfo();return;}
 showView('view-new');
 if(text){var ai=$('prompt-input-app');if(ai){ai.value=text;autogrow(ai);}startPromptFlow(text);}
 else if(!restoreDraft()){resetNewJobForm();}
}
function initNewJob(){
 var picker=$('trade-picker');
 if(picker)picker.querySelectorAll('button').forEach(function(b){b.addEventListener('click',function(){
  switchTrade(b.getAttribute('data-trade')); });});
 var wp=$('worker-phone'); if(wp)wp.addEventListener('input',updateWorkerSummary);
 var wn=$('worker-name'); if(wn)wn.addEventListener('input',updateWorkerSummary);
 var we=$('worker-summary-edit'); if(we)we.addEventListener('click',function(){var ph=$('worker-phone');if(ph)ph.focus();});
 var appInp=$('prompt-input-app');
 if(appInp)appInp.addEventListener('input',function(){
  autogrow(appInp);
  var parsed=parsePromptSafe(appInp.value);
  promptChips($('prompt-chips-app'),parsed);
  if(parsed.trade&&parsed.trade!==draft.trade)switchTrade(parsed.trade);
  if(parsed.price!=null)$('job-price').value=parsed.price;
  if(parsed.deadline)$('job-deadline').value=parsed.deadline;
  if(parsed.scope||parsed.description)$('job-scope').value=parsed.scope||parsed.description;
 });
 var wr=$('warn-resolve'); if(wr)wr.addEventListener('click',function(){var f=$('fs-questions');if(f)f.scrollIntoView({behavior:'smooth',block:'center'});});
 /* N2: site pin and milestones sit behind collapsed one-tap toggles,
    closed by default. The site map is built on the toggle's first tap. */
 var st=$('site-toggle');
 if(st)st.addEventListener('click',function(){
  var blk=$('site-block'); if(!blk)return;
  var open=blk.hidden; blk.hidden=!open; st.setAttribute('aria-expanded',open?'true':'false');
  if(open&&!siteMap)initSiteMap();
 });
 var mt=$('ms-toggle');
 if(mt)mt.addEventListener('click',function(){
  var blk=$('ms-block'); if(!blk)return;
  var open=blk.hidden; blk.hidden=!open; mt.setAttribute('aria-expanded',open?'true':'false');
 });
 $('btn-site-me').addEventListener('click',function(){
  if(!('geolocation' in navigator)){showErr(lang==='bn'?'এই ডিভাইসে লোকেশন পাওয়া যাচ্ছে না।':'Location is not available on this device.');return;}
  navigator.geolocation.getCurrentPosition(function(p){setSite(p.coords.latitude,p.coords.longitude);},
   function(e){showErr(e.message);},{enableHighAccuracy:true,timeout:10000});});
 $('btn-site-clear').addEventListener('click',function(){draft.site=null;if(siteMarker&&siteMap){siteMap.removeLayer(siteMarker);siteMarker=null;}var p=$('site-picked');if(p)p.hidden=true;$('site-address').value='';});
 $('add-milestone').addEventListener('click',function(){
  var d=document.createElement('div'); d.className='field-grid';
  d.innerHTML='<div><input type="text" class="ms-title" placeholder="'+(lang==='bn'?'মাইলস্টোনের নাম — যেমন: ওয়্যারিং শেষ':'Milestone title')+'"></div><div><input type="number" class="ms-amount" min="0" inputmode="numeric" placeholder="'+(lang==='bn'?'টাকার পরিমাণ ৳':'Amount ৳')+'"></div>';
  $('milestone-rows').appendChild(d); });
 $('prompt-q-send').addEventListener('click',answerPromptQuestion);
 $('prompt-q-input').addEventListener('keydown',function(ev){if(ev.key==='Enter'){ev.preventDefault();answerPromptQuestion();}});
 $('prompt-q-skip').addEventListener('click',function(){if(promptQ&&promptQ.length){promptQ.shift();nextPromptQuestion();saveDraft();maybeRevealDetails();}});
 $('btn-review').addEventListener('click',function(){
  clearFieldErrs();
  if(!(Number($('job-price').value)>0)){fieldErr('err-price',lang==='bn'?'দাম ০-এর বেশি হতে হবে।':'Price must be more than 0.');showErr(lang==='bn'?'দাম ০-এর বেশি হতে হবে।':'Price must be more than 0.');return;}
  if(!$('job-deadline').value){fieldErr('err-deadline',lang==='bn'?'শেষ তারিখ দিন।':'Enter the deadline.');showErr(lang==='bn'?'শেষ তারিখ দিন।':'Enter the deadline.');return;}
  if(!$('job-scope').value.trim()){fieldErr('err-scope',lang==='bn'?'কাজের বিবরণ লিখুন।':'Describe the work.');showErr(lang==='bn'?'কাজের বিবরণ লিখুন।':'Describe the work.');return;}
  if(!$('worker-phone').value.trim()){fieldErr('err-worker-phone',lang==='bn'?'Worker-এর ফোন নম্বর দিন।':'Enter the worker phone number.');showErr(lang==='bn'?'Worker-এর ফোন নম্বর দিন।':'Enter the worker phone number.');return;}
  clearErr(); buildReview();
  var rr=$('review-record'); if(rr)rr.scrollIntoView({behavior:'smooth',block:'center'});
 });
 $('btn-create-job').addEventListener('click',async function(){
  clearErr(); clearFieldErrs();
  if(!draft.payload)buildReview();
  if(!(Number($('job-price').value)>0)){fieldErr('err-price',lang==='bn'?'দাম ০-এর বেশি হতে হবে।':'Price must be more than 0.');showErr(lang==='bn'?'দাম ০-এর বেশি হতে হবে।':'Price must be more than 0.');return;}
  if(!$('job-deadline').value){fieldErr('err-deadline',lang==='bn'?'শেষ তারিখ দিন।':'Enter the deadline.');showErr(lang==='bn'?'শেষ তারিখ দিন।':'Enter the deadline.');return;}
  if(!$('job-scope').value.trim()){fieldErr('err-scope',lang==='bn'?'কাজের বিবরণ লিখুন।':'Describe the work.');showErr(lang==='bn'?'কাজের বিবরণ লিখুন।':'Describe the work.');return;}
  if(!$('worker-phone').value.trim()){fieldErr('err-worker-phone',lang==='bn'?'Worker-এর ফোন নম্বর দিন।':'Enter the worker phone number.');showErr(lang==='bn'?'Worker-এর ফোন নম্বর দিন।':'Enter the worker phone number.');return;}
  buildReview();
  try{var r=await api('/api/jobs',{method:'POST',body:JSON.stringify(draft.payload)});
   var job=r.job||r; var id=job.id||job._id;
   try{localStorage.removeItem('dc_draft');}catch(e){}
   var link=r.workerLink||job.workerLink||job.worker_link||'';
   if(link){var cb=$('create-link-box');if(cb){cb.hidden=false;var u=$('create-link-url');if(u){u.textContent=t('detail.workerLinkLabel');u.href=link;}var ccb=$('btn-copy-link-create');if(ccb){ccb.onclick=function(){copyLinkText(link,t('detail.workerLinkLabel'));};ccb.hidden=false;}}}
   if(id){openJob(id);}else{showView('view-jobs');loadJobs();}
  }catch(e){showErr((lang==='bn'?'কাজ তৈরি হয়নি: ':'Could not create job: ')+e.message);}
 });
 $('btn-new-job').addEventListener('click',function(){
  showView('view-new');
  if(restoreDraft())return;
  resetNewJobForm();
 });
 $('jobs-empty').addEventListener('click',function(){var b=$('btn-new-job');if(b)b.click();});
 $('btn-new-back').addEventListener('click',function(){showView('view-jobs','back');loadJobs();});
 $('btn-refresh').addEventListener('click',loadJobs);
 $('btn-back-jobs').addEventListener('click',function(){locStopAll();showView('view-jobs','back');loadJobs();});
}

/* Downscale a photo to max 1280px on the long edge and ~300KB, client
   side, before upload. Files already under the limit go up as-is. */
function downscalePhoto(file){
 return new Promise(function(resolve,reject){
  if(file.size<=300*1024){resolve(file);return;}
  var url=URL.createObjectURL(file);
  var img=new Image();
  img.onload=function(){
   try{
    var w=img.naturalWidth, h=img.naturalHeight;
    var scale=Math.min(1,1280/Math.max(w,h));
    var cw=Math.max(1,Math.round(w*scale)), ch=Math.max(1,Math.round(h*scale));
    var cv=document.createElement('canvas'); cv.width=cw; cv.height=ch;
    var ctx=cv.getContext('2d'); ctx.drawImage(img,0,0,cw,ch);
    URL.revokeObjectURL(url);
    var quals=[0.85,0.7,0.55,0.4], qi=0;
    (function next(){
     if(qi>=quals.length){reject(new Error('too large'));return;}
     cv.toBlob(function(b){
      if(!b){reject(new Error('encode failed'));return;}
      if(b.size<=300*1024||qi===quals.length-1)resolve(b);
      else{qi++;next();}
     },'image/jpeg',quals[qi]);
    })();
   }catch(e){URL.revokeObjectURL(url);reject(e);}
  };
  img.onerror=function(){URL.revokeObjectURL(url);reject(new Error('decode failed'));};
  img.src=url;
 });
}

/* ---------- detail actions ---------- */
function initDetail(){
 /* Item 3: step "Next" buttons — one tap moves to the next step panel. */
 document.querySelectorAll('#view-detail [data-next-tab]').forEach(function(b){b.addEventListener('click',function(){
  var nx=b.getAttribute('data-next-tab');
  if(nx==='jobs'){locStopAll();showView('view-jobs','back');loadJobs();return;}
  var tab=document.querySelector('#view-detail .tabs button[data-tab="'+nx+'"]');
  if(tab){tab.click();var ds=$('detail-scroll');if(ds){ds.scrollTop=0;ds.scrollIntoView();}}
 });});
 /* Stepper: only the 5 step panels inside #view-detail toggle here. The
    More sheet panels (ChangeLock / Dispute / Billing) live outside the
    detail view and are never hidden by a step change. */
 document.querySelectorAll('#view-detail .tabs button').forEach(function(b){b.addEventListener('click',function(){
  document.querySelectorAll('#view-detail .tabs button').forEach(function(x){x.setAttribute('aria-selected',x===b?'true':'false');});
  document.querySelectorAll('#view-detail .tabpanel').forEach(function(p){p.hidden=(p.id!=='tab-'+b.getAttribute('data-tab'));});
  /* P1-5 (b1): a step change opens at its own top. The scroller used to
     keep its scrollTop across steps, so a panel opened scrolled-down
     hid its heading and first field above the scroller's top edge —
     reading as content sliding under the stepper. */
  var ds0=$('detail-scroll'); if(ds0)ds0.scrollTop=0;
  /* Step change flips/slides the new step panel in 3D (200ms,
     transform + opacity only) instead of appearing instantly. */
  var panel=document.getElementById('tab-'+b.getAttribute('data-tab'));
  if(panel&&!RM){panel.classList.remove('step-flip');void panel.offsetWidth;panel.classList.add('step-flip');}
  /* The flip class STAYS on the panel after the animation (the suite pins
     cls + animationName after stepping). The overflow it used to cause is
     fixed in CSS instead: stepFlip is hinged on the LEFT edge, so the
     rotating panel never swings past the scroller's right edge (the old
     centre-hinged -9deg flip swung the right edge up to 74px out and
     inflated #detail-scroll's scrollWidth to 1335). */
  /* Step 3 holds the live map, which is created while its panel is hidden:
     Leaflet sizes the tile grid to 0 unless it is re-measured once the
     panel is visible — so re-measure it every time step 3 opens. */
  if(b.getAttribute('data-tab')==='s3'&&locMap)locMap.invalidateSize();
  moveTabInd();
  refreshJob(); });});
 /* Payment method — 3 big one-tap buttons drive the same select the
    submit handler reads. */
 var pm=$('pay-methods');
 if(pm)pm.querySelectorAll('button').forEach(function(b){b.addEventListener('click',function(){
  pm.querySelectorAll('button').forEach(function(x){x.setAttribute('aria-pressed',x===b?'true':'false');});
  var sel=$('pay-method'); if(sel)sel.value=b.getAttribute('data-method'); });});
 var st=$('btn-share-trip'); if(st)st.addEventListener('click',shareTrip);
 /* P2-7: the duplicate #btn-share-trip-fab is gone — exactly one
    location action per screen (the step-3 button, hidden on DRAFT). */
 var lr=$('btn-loc-retry'); if(lr)lr.addEventListener('click',retryLocMap);
 $('btn-hirer-confirm').addEventListener('click',async function(){clearErr();
  try{await api('/api/jobs/'+encodeURIComponent(currentJobId)+'/hirer-confirm',{method:'POST',body:JSON.stringify({otpCode:$('confirm-otp').value.trim()})});showSuccessCheck();openJob(currentJobId);}
  catch(e){showErr(otpErrText(e)||e.message);}});
 async function resendWorkerLink(){clearErr();clearNotice();
  /* The worker-link endpoint may not exist yet;
     a 404 is reported, not hidden. */
  try{var r=await api('/api/jobs/'+encodeURIComponent(currentJobId)+'/worker-link',{method:'POST',body:'{}'});
   var link=(r&&(r.workerLink||r.worker_link||(r.job&&(r.job.workerLink||r.job.worker_link))))||'';
   if(link){if(currentJob)currentJob.workerLink=link;
    var wlu=$('worker-link-url');if(wlu){wlu.textContent=t('detail.workerLinkLabel');wlu.href=link;}
    var clu=$('create-link-url');if(clu){clu.textContent=t('detail.workerLinkLabel');clu.href=link;}}
   showNotice(t('detail.resendOk'));}
  catch(e){showErr((lang==='bn'?'লিংক আবার পাঠানো যায়নি: ':'Could not resend link: ')+e.message);}}
 var rs=$('btn-resend-link'); if(rs)rs.addEventListener('click',resendWorkerLink);
 var rsc=$('btn-resend-link-create'); if(rsc)rsc.addEventListener('click',resendWorkerLink);
 /* R4: the WorkPassport belongs to the worker — the hirer only resends
    the worker link from here. */
 var prs=$('btn-passport-resend'); if(prs)prs.addEventListener('click',resendWorkerLink);
 /* Item 4: the confirm OTP — Send requests it, Resend re-requests it
    with a 60s disabled countdown. Wrong/expired codes get a plain
    sentence, never the raw error. */
 async function requestConfirmOtp(){clearErr();
  /* hirer-confirm verifies purpose 'hirer-confirm' — request that OTP explicitly */
  try{var r=await api('/api/auth/request-otp',{method:'POST',body:JSON.stringify({phone:(user&&user.phone)||'',purpose:'hirer-confirm'})});
   /* P0-3: the code is never rendered in the UI — it arrives by SMS. */
   $('confirm-otp').focus();
  }catch(e){showErr(otpErrText(e)||e.message);}}
 $('btn-confirm-send-otp').addEventListener('click',requestConfirmOtp);
 var cres=$('btn-confirm-resend'), cresTimer=null;
 if(cres)cres.addEventListener('click',function(){
  if(cres.disabled)return;
  requestConfirmOtp();
  var left=60; cres.disabled=true;
  cres.textContent=t('otp.resendIn').replace('{n}',String(left));
  if(cresTimer)clearInterval(cresTimer);
  cresTimer=setInterval(function(){
   left--;
   if(left<=0){clearInterval(cresTimer);cresTimer=null;cres.disabled=false;cres.textContent=t('otp.resend');}
   else cres.textContent=t('otp.resendIn').replace('{n}',String(left));
  },1000);
 });
 $('form-change').addEventListener('submit',async function(ev){ev.preventDefault();clearErr();
  var delta=Number($('ch-delta').value)||0, dl=$('ch-deadline').value||'', rs=$('ch-reason').value.trim();
  var ce=$('change-err');
  /* R2: a proposal must change something — price, deadline, or a reason.
     The server rule is untouched; this is the client-side guard. */
  if(delta===0&&!dl&&!rs){if(ce){ce.hidden=false;ce.textContent=t('change.emptyErr');}return;}
  if(ce)ce.hidden=true;
  try{var r=await api('/api/jobs/'+encodeURIComponent(currentJobId)+'/changes',{method:'POST',body:JSON.stringify({priceDelta:delta,deadline:dl||undefined,reason:rs,details:rs})});
   /* Insert the notice AFTER the re-render: openJob rebuilds #change-list,
      so inserting before it wipes the notice instantly and the hirer never
      sees that the proposal was sent. */
   await openJob(currentJobId); showSuccessCheck();
   if(r&&r.notifyLink){clearErr();var n=$('change-list');if(n)n.insertAdjacentHTML('afterbegin','<div class="notice"><b>'+esc(t('change.sent'))+'</b><p><a class="pill" href="'+esc(r.notifyLink)+'">'+esc(t('detail.workerLinkLabel'))+'</a></p></div>');}}
  catch(e){showErr(e.message);}});
 /* Item 5: the payment form never posts on submit — it shows an inline
    summary first (amount · method · date · remaining after), and only
    "Yes, record it" posts, once. */
 var payForm=$('form-pay');
 payForm.addEventListener('submit',function(ev){ev.preventDefault();clearErr();clearFieldErrs();
  var amt=Number($('pay-amount').value);
  if(!(amt>0)){fieldErr('err-pay-amount',lang==='bn'?'দাম ০-এর বেশি হতে হবে।':'Price must be more than 0.');showErr(lang==='bn'?'দাম ০-এর বেশি হতে হবে।':'Price must be more than 0.');return;}
  var method=$('pay-method').value;
  var date=$('pay-date').value||'';
  var remNow=0; try{remNow=(renderDetail._prevBal&&renderDetail._prevBal.rem)||0;}catch(e){}
  var sum=$('pay-summary');
  if(sum)sum.innerHTML='<h3>'+esc(t('pay.summaryTitle'))+'</h3><table>'+
   '<tr><th>'+(lang==='bn'?'টাকা':'Amount')+'</th><td>'+taka(amt)+'</td></tr>'+
   '<tr><th>'+(lang==='bn'?'মাধ্যম':'Method')+'</th><td>'+esc(method)+'</td></tr>'+
   '<tr><th>'+(lang==='bn'?'তারিখ':'Date')+'</th><td>'+esc(date?fmtDate(date):'—')+'</td></tr>'+
   '<tr><th>'+esc(t('pay.remAfter'))+'</th><td>'+taka(Math.max(0,remNow-amt))+'</td></tr></table>';
  payForm.hidden=true;
  var pc=$('pay-confirm'); if(pc)pc.hidden=false;
 });
 var pfc=$('pay-full-chip');
 if(pfc)pfc.addEventListener('click',function(){
  var remNow=0; try{remNow=(renderDetail._prevBal&&renderDetail._prevBal.rem)||0;}catch(e){}
  if(remNow>0){var pa=$('pay-amount');if(pa)pa.value=remNow;}
 });
 var pcf=$('btn-pay-confirm');
 if(pcf)pcf.addEventListener('click',async function(){clearErr();
  pcf.disabled=true;
  try{await api('/api/jobs/'+encodeURIComponent(currentJobId)+'/payments',{method:'POST',body:JSON.stringify({amount:Number($('pay-amount').value),method:$('pay-method').value,date:$('pay-date').value||undefined})});showSuccessCheck();openJob(currentJobId);}
  catch(e){showErr(e.message);pcf.disabled=false;}});
 var pch=$('btn-pay-change');
 if(pch)pch.addEventListener('click',function(){var pc=$('pay-confirm');if(pc)pc.hidden=true;payForm.hidden=false;var pa=$('pay-amount');if(pa)pa.focus();});
 /* Item 6: photo preview + client-side downscale (max 1280px / ~300KB)
    before upload. "Photo too large" appears only if downscaling fails. */
 var photoInput=$('photo-input');
 if(photoInput)photoInput.addEventListener('change',function(){
  var pv=$('photo-preview'); if(!pv)return;
  var f=photoInput.files[0];
  if(f){pv.src=URL.createObjectURL(f);pv.hidden=false;}
  else{pv.hidden=true;pv.removeAttribute('src');}
 });
 $('form-photo').addEventListener('submit',async function(ev){ev.preventDefault();clearErr();
  var f=$('photo-input').files[0]; if(!f){showErr(lang==='bn'?'একটি ছবি বেছে নিন।':'Choose a photo first.');return;}
  var fd=new FormData();
  try{
   var blob=await downscalePhoto(f);
   fd.append('photo',blob,f.name||'photo.jpg');
  }catch(e){showErr(t('pay.photoTooLarge'));return;}
  var pk=$('photo-kind'); if(pk)fd.append('kind',pk.value);
  try{await api('/api/jobs/'+encodeURIComponent(currentJobId)+'/photos',{method:'POST',body:fd});showSuccessCheck();openJob(currentJobId);}
  catch(e){showErr(e.message);}});
 $('form-dispute').addEventListener('submit',async function(ev){ev.preventDefault();clearErr();
  try{await api('/api/jobs/'+encodeURIComponent(currentJobId)+'/disputes',{method:'POST',body:JSON.stringify({category:$('dis-category').value,statement:$('dis-text').value.trim()})});showSuccessCheck();openJob(currentJobId);}
  catch(e){showErr(e.message);}});
 /* Item 8 + R3: two close paths, one visible at a time — the worker's
    code, or closing alone (which never lands on the WorkPassport). The
    button stays disabled until a 6-digit code is in, or "Close alone"
    is picked. The close-force checkbox shows only under the code path. */
 function updateCloseUI(){
  var alone=$('close-anyway')&&$('close-anyway').checked;
  var otpWrap=$('close-otp-wrap'); if(otpWrap)otpWrap.hidden=!!alone;
  var warn=$('close-alone-warn'); if(warn)warn.hidden=!alone;
  var fw=$('close-force-wrap'); if(fw)fw.hidden=!!alone;
  var otpVal=$('close-otp')?$('close-otp').value.replace(/\D/g,''):'';
  var btn=$('btn-close-job'); if(btn)btn.disabled=!(alone||otpVal.length===6);
 }
 var co=$('close-otp'); if(co)co.addEventListener('input',function(){co.value=co.value.replace(/\D/g,'').slice(0,6);updateCloseUI();});
 var cmOtp=$('close-mode-otp'); if(cmOtp)cmOtp.addEventListener('change',updateCloseUI);
 var cmAlone=$('close-anyway'); if(cmAlone)cmAlone.addEventListener('change',updateCloseUI);
 updateCloseUI();
 var bco=$('btn-close-open');
 if(bco)bco.addEventListener('click',function(){
  openSheet('sheet-more','dispute');
  var h=$('close-heading'); if(h)setTimeout(function(){h.scrollIntoView({block:'start'});},50);
 });
 $('btn-close-job').addEventListener('click',async function(){clearErr();
  /* The server requires either the worker's close-confirm OTP or an
     explicit closeAnyway — sending neither always 400s, so the old button
     could never close a job. The OTP comes from the worker's page. */
  try{var body={confirmCompletion:true};
   if($('close-force')&&$('close-force').checked){body.force=true;body.note='Closed by hirer before all milestones were approved.';}
   var cotp=$('close-otp')?$('close-otp').value.trim():'';
   if(cotp)body.workerOtpCode=cotp;
   if($('close-anyway')&&$('close-anyway').checked)body.closeAnyway=true;
   await api('/api/jobs/'+encodeURIComponent(currentJobId)+'/close',{method:'POST',body:JSON.stringify(body)});showSuccessCheck();openJob(currentJobId);}
  catch(e){showErr(e.message);}});
 $('btn-passport-add').addEventListener('click',function(){
  /* Worker-owned: only the worker (from their link) can add a job to
     their WorkPassport and choose what it shows. The hirer cannot publish
     the worker's record — the worker does it from the worker page. */
  var box=$('passport-box');
  if(box)box.innerHTML='<p class="small">'+(lang==='bn'?'WorkPassport ওয়ার্কারের নিজের: কাজ শেষ হলে ওয়ার্কার নিজের লিংক থেকে এই কাজটি যোগ করবেন, আর কী দেখাবে তা নিজেই ঠিক করবেন।':'The WorkPassport belongs to the worker: after the job closes, the worker adds it from their own link and chooses what it shows.')+'</p>';
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
   /* P0-3: the CaaS code is never rendered in the UI — it arrives by SMS. */
   box.innerHTML='<div class="notice">'+(lang==='bn'?'OTP SMS-এ পাঠানো হয়েছে।':'OTP sent by SMS.')+'</div>'+
    '<label>OTP</label><input id="caas-otp" type="text" inputmode="numeric" placeholder="OTP" maxlength="6" autocomplete="one-time-code"><p class="free-otp">'+esc(t('otp.free'))+'</p><div class="btn-row"><button class="btn btn-dark btn-sm" type="button" id="caas-verify">'+esc(t('caas.verify'))+'</button></div>';
   $('caas-verify').addEventListener('click',async function(){try{var v=await api('/api/billing/caas/'+encodeURIComponent(id||currentJobId)+'/verify',{method:'POST',body:JSON.stringify({otpCode:$('caas-otp').value.trim()})});if(v.status==='VERIFIED')feePaidForJob[currentJobId]=true;box.innerHTML='<p class="mono">'+(v.status==='VERIFIED'?esc(t('caas.paid')):esc(t('caas.status'))+': '+esc(statusLabel(v.status||'PENDING')))+'</p>';loadBillingStatus();}catch(e){showErr(otpErrText(e)||e.message);}});
  }catch(e){showErr(e.message);}});
 $('btn-sub').addEventListener('click',async function(){clearErr();
  try{var r=await api('/api/billing/subscribe',{method:'POST',body:JSON.stringify({plan:'monthly'})});
   $('billing-box').innerHTML='<p class="mono">'+esc(t('sub.done'))+' · '+esc(statusLabel(r.status||r.state||'ACTIVE'))+'</p>';loadBillingStatus();
  }catch(e){showErr(e.message);}});
 /* R5b: cancel the subscription — shown only while it is ACTIVE. */
 var ub=$('btn-unsub');
 if(ub)ub.addEventListener('click',async function(){clearErr();
  try{await api('/api/billing/unsubscribe',{method:'POST',body:'{}'});showNotice(t('bill.unsubDone'));loadBillingStatus();}
  catch(e){showErr(e.message);}});
}

/* ---------- find a repairer: photo + nearby bidding (separate mode) ---------- */
/* A bid alone is never an agreement. Picking a bid creates a normal Job
   (pre-filled from the bid) which still needs dual OTP confirmation. */
var bidTrade='ELECTRICIAN', bidSite=null, findLoc=null, currentBidJobId=null;
var pendingBidText='';
var bidSiteMap=null, bidSiteMarker=null, bidSiteTiles=null, bidSiteTileErrors=0, bidSiteTileLoads=0, bidSiteTileTimer=null;
/* B1: the bid-post site map — same tap-to-pin pattern as the job site
   picker, same dotted-schematic fallback when tiles never arrive. The
   address field below stays the fallback; the map box is never blank. */
function showBidSiteFallback(){
 var fb=$('bid-site-fallback'); if(!fb)return;
 var el=$('bid-site-map'); if(el)el.hidden=true;
 var svgEl=$('bid-site-fallback-svg'); if(svgEl)svgEl.innerHTML=mapFallbackSVG(null,bidSite||null,null);
 fb.hidden=false;
}
function hideBidSiteFallback(){
 var fb=$('bid-site-fallback'); if(fb)fb.hidden=true;
 var el=$('bid-site-map'); if(el&&bidSiteMap)el.hidden=false;
}
function bidSiteAttachTiles(){
 var tiles=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap contributors'});
 tiles.on('tileload',function(){
  bidSiteTileLoads++;
  if(bidSiteTileTimer){clearTimeout(bidSiteTileTimer);bidSiteTileTimer=null;}
  var fb=$('bid-site-fallback');
  if(fb&&!fb.hidden){bidSiteTileErrors=0;hideBidSiteFallback();}
 });
 tiles.on('tileerror',function(){bidSiteTileErrors++;if(bidSiteTileErrors>=3)showBidSiteFallback();});
 return tiles;
}
function retryBidSiteMap(){
 if(!bidSiteMap)return;
 bidSiteTileErrors=0; bidSiteTileLoads=0;
 if(bidSiteTiles){try{bidSiteMap.removeLayer(bidSiteTiles);}catch(e){}}
 bidSiteTiles=bidSiteAttachTiles(); bidSiteTiles.addTo(bidSiteMap);
 bidSiteMap.invalidateSize(); hideBidSiteFallback();
 if(bidSiteTileTimer)clearTimeout(bidSiteTileTimer);
 bidSiteTileTimer=setTimeout(function(){if(!bidSiteTileLoads)showBidSiteFallback();},6000);
}
function setBidSite(lat,lng,silent){
 bidSite={lat:+lat.toFixed(6),lng:+lng.toFixed(6)};
 if(bidSiteMap){if(bidSiteMarker)bidSiteMarker.setLatLng([lat,lng]);else bidSiteMarker=L.marker([lat,lng]).addTo(bidSiteMap);if(!silent)bidSiteMap.setView([lat,lng],15);}
 var el=$('bid-picked'); if(el){el.hidden=false;el.textContent=t('bid.picked');}
 var sf=$('bid-site-fallback'); if(sf&&!sf.hidden){var s=$('bid-site-fallback-svg');if(s)s.innerHTML=mapFallbackSVG(null,bidSite,null);}
}
function initBidSiteMap(){
 var el=$('bid-site-map'); if(!el||bidSiteMap)return;
 if(typeof L==='undefined'){showBidSiteFallback();return;}
 bidSiteMap=L.map(el).setView([23.8103,90.4125],12);
 bidSiteTiles=bidSiteAttachTiles(); bidSiteTiles.addTo(bidSiteMap);
 bidSiteTileTimer=setTimeout(function(){if(!bidSiteTileLoads)showBidSiteFallback();},6000);
 bidSiteMap.on('click',function(e){setBidSite(e.latlng.lat,e.latlng.lng);});
 if(bidSite)setBidSite(bidSite.lat,bidSite.lng,true);
 setTimeout(function(){bidSiteMap.invalidateSize();},100);
 var rb=$('btn-bid-site-retry'); if(rb)rb.onclick=retryBidSiteMap;
}
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
 var box=$('bid-mine-list'); if(!box)return; box.innerHTML='<p class="small">'+esc(t('job.loading'))+'</p>';
 try{var r=await api('/api/bid-jobs/mine'); var rows=r.bidJobs||[];
  box.innerHTML=rows.length?rows.map(function(b){
   return '<div class="job-row"><div><div class="t">'+esc(tradeLabel(b.trade))+' — '+esc((b.description||'').slice(0,60))+'</div><div class="m">'+esc(statusLabel(b.status))+' · '+esc(b.liveBids||0)+' '+(lang==='bn'?'টি দর':'live bids')+' · '+esc(fmtDate(b.created_at))+'</div></div><button class="btn btn-dark btn-sm" type="button" data-bidjob="'+esc(b.id)+'">'+(lang==='bn'?'দর দেখুন':'See bids')+'</button></div>';
  }).join(''):'<p class="small">'+(lang==='bn'?'এখনো কোনো দর-খোলা কাজ নেই।':'No open bid jobs yet.')+'</p>';
  box.querySelectorAll('[data-bidjob]').forEach(function(btn){btn.addEventListener('click',function(){openBidDetail(btn.getAttribute('data-bidjob'));});});
 }catch(e){box.innerHTML='<p class="small">'+esc(e.message)+'</p>';}
}
async function openBidDetail(id){
 currentBidJobId=id; clearErr();
 var bar0=$('bid-cheapest-bar'); if(bar0)bar0.hidden=true;
 try{var r=await api('/api/bid-jobs/'+encodeURIComponent(id));
  var b=r.bidJob; var bids=r.bids||[];
  $('bid-detail-title').textContent=tradeLabel(b.trade)+' — '+((b.description||'').slice(0,80));
  $('bid-detail-meta').textContent=statusLabel(b.status)+' · '+fmtDate(b.created_at)+(b.siteArea?' · '+b.siteArea:'')+(b.deadline?' · '+(lang==='bn'?'শেষ তারিখ: ':'Deadline: ')+fmtDate(b.deadline):'');
  $('bid-detail-photos').innerHTML=bidPhotosHtml(b.photos);
  var bl=$('bid-list');
  /* Cheapest first: the server already orders by amount ASC — but the
     LOWEST pill is computed over LIVE bids only, so an expired cheapest
     bid never steals the pill from the live one below it. */
  var liveBids=bids.filter(function(x){return x.status==='LIVE';});
  var otherBids=bids.filter(function(x){return x.status!=='LIVE';});
  var lowestLive=null;
  liveBids.forEach(function(x){if(!lowestLive||x.amount<lowestLive.amount)lowestLive=x;});
  function bidRowHtml(bd){
   var pass=bd.passport||{};
   var lowest=lowestLive&&bd.id===lowestLive.id;
   var facts=[];
   if(pass.completedJobs!=null)facts.push((lang==='bn'?'সম্পন্ন কাজ: ':'Completed jobs: ')+pass.completedJobs);
   if(pass.trades&&pass.trades.length)facts.push((lang==='bn'?'কাজের ধরন: ':'Trades: ')+pass.trades.join(', '));
   /* Bidding pick screen: each bid carries the worker's profile card
      (same shared renderer as the job page) above its price — the
      hirer picks from verified facts, never stars or scores. The pick
      card is compact: no Member-since fact. */
   return '<div class="job-row" style="display:block">'+renderProfileCard(bidProfile(bd,b.trade),{hideSince:true})
    +'<div><div class="t">'+taka(bd.amount)+(lowest?' <span class="pill pill-orange">'+esc(t('find.lowest'))+'</span>':'')+'</div><div class="m">'+esc(bd.note||'')+(bd.earliestStart?' · '+(lang==='bn'?'শুরু: ':'Starts: ')+esc(bd.earliestStart):'')+'</div><div class="m">'+(bd.distanceKm!=null?(lang==='bn'?'সরলরেখা দূরত্ব: ':'Straight-line distance: ')+bd.distanceKm+' km':(lang==='bn'?'দূরত্ব জানা নেই':'Distance unavailable'))+' · '+esc(facts.join(' · '))+'</div><div class="m">'+esc(statusLabel(bd.status))+' · '+(lang==='bn'?'মেয়াদ: ':'Expires: ')+esc(fmtDT(bd.expires_at))+'</div></div>'+
   (bd.status==='LIVE'?'<div class="btn-row"><button class="btn btn-dark btn-sm btn-3d" type="button" data-accept="'+esc(bd.id)+'">'+(lang==='bn'?'বেছে নিন':'Pick this bid')+'</button></div>':'')+'</div>';
  }
  var html='';
  if(liveBids.length)html+=liveBids.map(bidRowHtml).join('');
  if(otherBids.length)html+='<details><summary>'+esc(t('bid.closedBids'))+' ('+otherBids.length+')</summary>'+otherBids.map(bidRowHtml).join('')+'</details>';
  bl.innerHTML=html||'<p class="small">'+(lang==='bn'?'এখনো কোনো দর আসেনি।':'No bids yet.')+'</p>';
  async function acceptBid(bidId){
   clearErr();
   try{var acc=await api('/api/bid-jobs/'+encodeURIComponent(currentBidJobId)+'/bids/'+encodeURIComponent(bidId)+'/accept',{method:'POST',body:'{}'});
    showNotice(lang==='bn'?'দর বেছে নেওয়া হয়েছে — এখন রেকর্ড তৈরি হয়েছে। দুই পক্ষের OTP দিয়ে নিশ্চিত করুন।':'Bid picked — the record is created. Both sides must now confirm by OTP.');
    if(acc&&acc.job&&acc.job.id){openJob(acc.job.id);showSuccessCheck();}
   }catch(e){showErr(e.message);}
  }
  bl.querySelectorAll('[data-accept]').forEach(function(btn){btn.addEventListener('click',function(){acceptBid(btn.getAttribute('data-accept'));});});
  /* Sticky cheapest bar: the lowest LIVE bid, one tap to pick it. */
  if(bar0&&lowestLive){
   bar0.hidden=false;
   var nm=lowestLive.workerName||(lowestLive.workerProfile&&lowestLive.workerProfile.name)||'';
   var ct=$('bid-cheapest-text'); if(ct)ct.textContent=t('bid.cheapest').replace('{amt}',taka(lowestLive.amount)).replace('{name}',nm);
   var cb=$('btn-bid-cheapest'); if(cb)cb.onclick=function(){acceptBid(lowestLive.id);};
  }
  showView('view-bid-detail');
 }catch(e){showErr(e.message);}
}
/* B3: one bid composer per view, above the list. Each open job shows
   title + distance + bid count + photos + ONE primary "Place bid"
   button; tapping it opens the composer prefilled with that job. */
var composerBidJobId=null;
function bnToEn(s){var m={'০':'0','১':'1','২':'2','৩':'3','৪':'4','৫':'5','৬':'6','৭':'7','৮':'8','৯':'9'};return String(s||'').replace(/[০-৯]/g,function(c){return m[c];}).replace(/,/g,'').trim();}
function openBidComposer(id,trade,title){
 composerBidJobId=id;
 var c=$('bid-composer'); if(!c)return;
 var ttl=$('bid-composer-title'); if(ttl)ttl.textContent=tradeLabel(trade)+' — '+title;
 var amt=$('bid-c-amount'); if(amt)amt.value='';
 var st=$('bid-c-start'); if(st){st.value='';try{st.min=new Date(Date.now()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,10);}catch(e){}}
 var nt=$('bid-c-note'); if(nt)nt.value='';
 var er=$('bid-amount-err'); if(er)er.hidden=true;
 c.hidden=false;
 c.scrollIntoView({block:'nearest'});
 if(amt)amt.focus();
}
async function submitBidComposer(){
 clearErr();
 if(!composerBidJobId)return;
 var amt=Number(bnToEn(($('bid-c-amount')||{}).value));
 var er=$('bid-amount-err');
 if(!(amt>0)){
  /* Inline under the price field, in Bangla — never the global error. */
  if(er){er.hidden=false;er.textContent=t('bid.amountErr');}
  var a=$('bid-c-amount'); if(a)a.focus();
  return;
 }
 if(er)er.hidden=true;
 try{var placed=await api('/api/bid-jobs/'+encodeURIComponent(composerBidJobId)+'/bids',{method:'POST',body:JSON.stringify({
   amount:amt,
   note:($('bid-c-note')||{}).value.trim()||undefined,
   earliestStart:($('bid-c-start')||{}).value||undefined,
   workerLat:findLoc?findLoc.lat:undefined, workerLng:findLoc?findLoc.lng:undefined})});
  var bidRow=placed&&(placed.bid||placed);
  if(bidRow&&bidRow.id)saveMyBid(composerBidJobId,bidRow.id,amt);
  showNotice(lang==='bn'?'দর দেওয়া হয়েছে — ২৪ ঘণ্টা কার্যকর থাকবে।':'Bid placed — valid for 24 hours.');
  var c=$('bid-composer'); if(c)c.hidden=true;
  composerBidJobId=null;
  loadOpenBidJobs(); renderMyBids();
 }catch(e){showErr(e.message);}
}
async function loadOpenBidJobs(){
 var box=$('find-work-list'); if(!box)return; box.innerHTML='<p class="small">'+esc(t('job.loading'))+'</p>';
 var q=findLoc?('?lat='+findLoc.lat+'&lng='+findLoc.lng):'';
 /* Never print raw coordinates: the note says only that location is set
    (nearest first) or not set (newest first). */
 $('find-loc-note').textContent=findLoc?t('bid.locSet'):(lang==='bn'?'লোকেশন ছাড়া — নতুন কাজ আগে। দূরত্ব দেখতে “আমার লোকেশন ব্যবহার করুন” চাপুন।':'No location — newest first. Tap “Use my location” to see distance.');
 try{var r=await api('/api/bid-jobs/open'+q); var rows=r.bidJobs||[];
  box.innerHTML=rows.length?rows.map(function(b){
   return '<div class="job-row" style="display:block"><div><div class="t">'+esc(tradeLabel(b.trade))+' — '+esc((b.description||'').slice(0,80))+'</div><div class="m">'+bidDistText(b)+' · '+esc(b.bidCount||0)+' '+(lang==='bn'?'টি দর':'bids')+' · '+esc(fmtDate(b.created_at))+(b.siteArea?' · '+esc(b.siteArea):'')+'</div></div>'+
   bidPhotosHtml(b.photos)+
   '<div class="btn-row"><button class="btn btn-orange btn-3d" type="button" style="min-height:52px" data-bid-open="'+esc(b.id)+'" data-bid-trade="'+esc(b.trade)+'" data-bid-title="'+esc((b.description||'').slice(0,80))+'">'+(lang==='bn'?'দর দিন':'Place bid')+'</button></div></div>';
  }).join(''):'<p class="small">'+(lang==='bn'?'এখন কোনো খোলা কাজ নেই।':'No open jobs right now.')+'</p>';
  box.querySelectorAll('[data-bid-open]').forEach(function(btn){btn.addEventListener('click',function(){
   openBidComposer(btn.getAttribute('data-bid-open'),btn.getAttribute('data-bid-trade'),btn.getAttribute('data-bid-title'));
  });});
 }catch(e){box.innerHTML='<p class="small">'+esc(e.message)+'</p>';}
}
/* My live bids (kept on the phone): price + note + earliest start were
   one screen; withdrawing one is one tap. */
function myBids(){try{return JSON.parse(localStorage.getItem('dc_my_bids')||'[]');}catch(e){return[];}}
function saveMyBid(bidJobId,bidId,amount){
 try{var l=myBids();l=l.filter(function(b){return b.bidJobId!==bidJobId;});
  l.push({bidJobId:bidJobId,bidId:bidId,amount:amount,at:Date.now()});localStorage.setItem('dc_my_bids',JSON.stringify(l));}catch(e){}
}
function renderMyBids(){
 var box=$('my-bids-list'); if(!box)return;
 var l=myBids();
 if(!l.length){box.innerHTML='<p class="small">'+(lang==='bn'?'এখনো কোনো দর দেননি।':'No bids placed yet.')+'</p>';return;}
 box.innerHTML=l.map(function(b){
  return '<div class="job-row"><div><div class="t">'+taka(b.amount)+'</div><div class="m">'+esc(t('bid.yourBid'))+' · '+esc(fmtDT(b.at))+'</div></div><button class="btn btn-dark-ghost btn-sm" type="button" data-withdraw="'+esc(b.bidId)+'">'+esc(t('bid.withdraw'))+'</button></div>';
 }).join('');
 box.querySelectorAll('[data-withdraw]').forEach(function(btn){btn.addEventListener('click',async function(){
  clearErr();
  try{
   await api('/api/worker/bids/'+encodeURIComponent(btn.getAttribute('data-withdraw'))+'/withdraw',{method:'POST',body:'{}'});
   try{var l=myBids().filter(function(b){return b.bidId!==btn.getAttribute('data-withdraw');});localStorage.setItem('dc_my_bids',JSON.stringify(l));}catch(e){}
   showNotice(t('bid.withdrawn')); renderMyBids();
  }catch(e){showErr(e.message);}
 });});
}
function parseBidPrompt(){
 var inp=$('bid-prompt'); if(!inp)return;
 autogrow(inp);
 var parsed=parsePromptSafe(inp.value||'');
 promptChips($('bid-prompt-chips'),parsed);
 if(parsed.trade){
  bidTrade=parsed.trade;
  var pk=$('bid-trade-picker');
  if(pk)pk.querySelectorAll('button').forEach(function(x){x.setAttribute('aria-pressed',x.getAttribute('data-trade')===parsed.trade?'true':'false');});
 }
 if(parsed.description){var d=$('bid-desc');if(d&&!d.value)d.value=parsed.description;}
 /* B2: prefill the deadline from the prompt when it contains one. */
 if(parsed.deadline){var bdl=$('bid-deadline');if(bdl&&!bdl.value)bdl.value=parsed.deadline;}
}
function initBidding(){
 var picker=$('bid-trade-picker');
 if(picker)picker.querySelectorAll('button').forEach(function(b){b.addEventListener('click',function(){
  bidTrade=b.getAttribute('data-trade');
  picker.querySelectorAll('button').forEach(function(x){x.setAttribute('aria-pressed',x===b?'true':'false');});});});
 $('btn-bid-post').addEventListener('click',function(){showView('view-bid-post');loadMyBidJobs();initBidSiteMap();});
 /* P2-9(d): the explanatory screen's two exits — back to jobs, or on to
    the bid-post form (carrying the landing prompt text, if any). */
 var bbi=$('btn-bid-info-back');
 if(bbi)bbi.addEventListener('click',function(){showView('view-jobs','back');loadJobs();});
 var bic=$('btn-bid-info-continue');
 if(bic)bic.addEventListener('click',function(){
  showView('view-bid-post'); loadMyBidJobs(); initBidSiteMap();
  if(pendingBidText){var bp=$('bid-prompt');if(bp){bp.value=pendingBidText;parseBidPrompt();}pendingBidText='';}
 });
 $('btn-find-work').addEventListener('click',function(){showView('view-find-work');loadOpenBidJobs();renderMyBids();});
 var bp=$('bid-prompt'); if(bp)bp.addEventListener('input',parseBidPrompt);
 var bbs=$('btn-bid-submit'); if(bbs)bbs.addEventListener('click',submitBidComposer);
 var bbc=$('btn-bid-cancel'); if(bbc)bbc.addEventListener('click',function(){var c=$('bid-composer');if(c)c.hidden=true;composerBidJobId=null;});
 $('btn-bid-back').addEventListener('click',function(){showView('view-jobs','back');loadJobs();});
 $('btn-find-back').addEventListener('click',function(){showView('view-jobs','back');loadJobs();});
 $('btn-bid-detail-back').addEventListener('click',function(){showView('view-bid-post','back');loadMyBidJobs();});
 $('btn-bid-me').addEventListener('click',function(){
  if(!('geolocation' in navigator)){showErr(lang==='bn'?'এই ডিভাইসে লোকেশন পাওয়া যাচ্ছে না।':'Location is not available on this device.');return;}
  navigator.geolocation.getCurrentPosition(function(p){setBidSite(p.coords.latitude,p.coords.longitude);},
   function(e){showErr(e.message);},{enableHighAccuracy:true,timeout:10000});});
 $('btn-bid-clear').addEventListener('click',function(){bidSite=null;if(bidSiteMarker&&bidSiteMap){bidSiteMap.removeLayer(bidSiteMarker);bidSiteMarker=null;}$('bid-address').value='';var el=$('bid-picked');if(el)el.hidden=true;});
 /* B4: no location, no raw error — one fixed Bangla line in the note
    plus a retry button. Jobs stay newest-first (the server order). */
 function showFindLocError(){
  var n=$('find-loc-note'); if(!n)return;
  n.textContent='';
  var span=document.createElement('span'); span.textContent=t('bid.noLoc')+' ';
  var rb=document.createElement('button'); rb.type='button'; rb.className='btn btn-dark-ghost btn-sm'; rb.textContent=t('bid.retryLoc');
  rb.addEventListener('click',findLocHandler);
  n.appendChild(span); n.appendChild(rb);
 }
 function findLocHandler(){
  if(!('geolocation' in navigator)){showFindLocError();return;}
  navigator.geolocation.getCurrentPosition(function(p){findLoc={lat:+p.coords.latitude.toFixed(6),lng:+p.coords.longitude.toFixed(6)};loadOpenBidJobs();},
   function(e){showFindLocError();},{enableHighAccuracy:true,timeout:10000});
 }
 $('btn-find-loc').addEventListener('click',findLocHandler);
 $('btn-find-refresh').addEventListener('click',loadOpenBidJobs);
 $('btn-bid-close').addEventListener('click',async function(){clearErr();
  try{await api('/api/bid-jobs/'+encodeURIComponent(currentBidJobId)+'/close',{method:'POST',body:'{}'});
   showNotice(lang==='bn'?'দর বন্ধ করা হয়েছে — কাউকে বাছা হয়নি।':'Bidding closed — nobody was picked.');
   showView('view-bid-post','back');loadMyBidJobs();
  }catch(e){showErr(e.message);}});
 $('form-bid-post').addEventListener('submit',async function(ev){ev.preventDefault();clearErr();
  var desc=$('bid-desc').value.trim();
  if(!desc){showErr(lang==='bn'?'সমস্যার বিবরণ লিখুন।':'Write a short description of the problem.');return;}
  try{var r=await api('/api/bid-jobs',{method:'POST',body:JSON.stringify({trade:bidTrade,description:desc,deadline:$('bid-deadline').value||undefined,
    site:bidSite?{lat:bidSite.lat,lng:bidSite.lng,address:$('bid-address').value.trim()||undefined}:($('bid-address').value.trim()?{address:$('bid-address').value.trim()}:undefined)})});
   var id=r.bidJob&&r.bidJob.id; if(!id)throw new Error('No bid job id returned');
   var files=$('bid-photos').files||[];
   for(var i=0;i<Math.min(files.length,3);i++){
    var fd=new FormData(); fd.append('photo',files[i]);
    await api('/api/bid-jobs/'+encodeURIComponent(id)+'/photos',{method:'POST',body:fd});
   }
   showNotice(lang==='bn'?'কাজটি দরের জন্য দেওয়া হয়েছে।':'Job posted for bids.');
   $('form-bid-post').reset(); bidSite=null; if(bidSiteMarker&&bidSiteMap){bidSiteMap.removeLayer(bidSiteMarker);bidSiteMarker=null;} var el=$('bid-picked'); if(el)el.hidden=true;
   loadMyBidJobs(); openBidDetail(id);
  }catch(e){showErr(e.message);}});
}

/* ---------- demo ---------- */
/* Per-visitor demo sandbox: a random id, kept in localStorage and sent on
   the seed call, so two visitors demoing at once never share a job. The
   server also sets the same id as the dc_demo cookie. */
function demoVisitorId(){try{var v=localStorage.getItem('dc_demo_visitor');if(!v||!/^[0-9a-f]{32}$/.test(v)){v='';var b=new Uint8Array(16);if(window.crypto&&crypto.getRandomValues){crypto.getRandomValues(b);}else{for(var i=0;i<16;i++)b[i]=Math.floor(Math.random()*256);}for(var j=0;j<16;j++)v+=('0'+b[j].toString(16)).slice(-2);localStorage.setItem('dc_demo_visitor',v);}return v;}catch(e){return '';}}
/* D1: demo mode — the create buttons are disabled, and a sessionStorage
   flag cleared on logout and on Exit. P0-3: no demo banner, no demo
   card, no demo-script panel anywhere in the product UI; Exit/Restart
   survive only as plain actions in the MORE menu (#more-demo-actions). */
var demoJobId=null;
function setDemoMode(on){
 document.body.classList.toggle('demo-mode',!!on);
 var md=$('more-demo-actions'); if(md)md.hidden=!on;
 var c1=$('btn-create-job'); if(c1)c1.disabled=!!on;
 var c2=$('btn-new-job'); if(c2)c2.disabled=!!on;
 try{if(on)sessionStorage.setItem('dc_in_demo','1');else sessionStorage.removeItem('dc_in_demo');}catch(e){}
}
async function restartDemo(){
 try{await api('/api/demo/reset',{method:'POST',body:'{}',headers:{'x-demo-visitor':demoVisitorId()}});}catch(e){}
 loadDemo();
}
async function exitDemo(){
 try{await api('/api/auth/logout',{method:'POST',body:'{}'});}catch(e){}
 token='';user=null;demoJobId=null;
 try{localStorage.removeItem('dc_token');localStorage.removeItem('dc_user');localStorage.removeItem('dc_pending_demo');}catch(e){}
 setDemoMode(false);
 showLanding();
}
async function loadDemo(){
 clearErr();
 var cd=$('cta-demo'), dop=$('demo-open');
 if(cd)cd.disabled=true; if(dop)dop.disabled=true;
 showNotice(t('demo.preparing'));
 try{var r=await api('/api/demo/seed',{method:'POST',body:'{}',headers:{'x-demo-visitor':demoVisitorId()}});
  var job=r.job||(r.jobs&&r.jobs[0]); var id=job&&(job.id||job._id);
  demoJobId=id||null;
  setDemoMode(true);
  if(id){try{localStorage.setItem('dc_pending_demo',id);}catch(e){}}
  if(r&&r.workerLink){try{localStorage.setItem('dc_demo_workerlink',r.workerLink);}catch(e){}}
  /* Guided demo, one click: the seed mints a real hirer session, so the
     evaluator lands inside the seeded job — no OTP copying, no manual
     login. Falls back to the OTP login below when no token came back. */
  if(r&&r.hirerToken){token=r.hirerToken;localStorage.setItem('dc_token',token);
   user=r.hirer||{phone:r.hirerPhone||'01700000001',name:'Rahim Uddin'};localStorage.setItem('dc_user',JSON.stringify(user));
   if(id){openJob(id);}else{showView('view-jobs');loadJobs();}
   return;}
  if(!token){ /* demo seed may return a token; otherwise show login with demo phone */
   var demoPhone=r.hirerPhone||'01700000001';
   $('login-phone').value=demoPhone;
   /* P0-3: no codes in the notice — the code arrives by SMS. */
   showNotice(lang==='bn'?'ডেমো তৈরি হয়েছে। হায়ারারের নম্বর '+demoPhone+' দিয়ে OTP লগইন করুন। লগইনের পর ডেমো কাজটি নিজে থেকেই খুলবে।':'Demo seeded. Log in with hirer number '+demoPhone+' and OTP. The demo job opens automatically after login.');
   $('form-login').hidden=false; $('form-otp').hidden=true;
   showView('view-login'); return; }
  if(id)openJob(id); else loadJobs(),showView('view-jobs');
 }catch(e){
  demoJobId=null;
  /* D4: never show "HTTP 404" or a raw error — demo-off means the
     login view with a plain explanation; anything else is the network
     message. (403 is the demo-token variant of "demo is off".) */
  if(e.status===404||e.status===403){
   showErr(t('demo.off'));
   $('form-login').hidden=false; $('form-otp').hidden=true;
   showView('view-login');
  }else showErr(networkMsg());
 }finally{
  if(cd)cd.disabled=false; if(dop)dop.disabled=false;
 }
}

/* ---------- nav: mark the section on screen ---------- */
function initNavSpy(){
 var links=document.querySelectorAll('.nav-links a[href^="#"]'); if(!links.length||!('IntersectionObserver' in window))return;
 var map={}; links.forEach(function(a){map[a.getAttribute('href').slice(1)]=a;});
 var obs=new IntersectionObserver(function(entries){
  entries.forEach(function(en){ if(en.isIntersecting){ var a=map[en.target.id]; if(a){ links.forEach(function(x){x.removeAttribute('aria-current');}); a.setAttribute('aria-current','true'); } } });
 },{rootMargin:'-40% 0px -55% 0px'});
 ['journey','price','why','live','find','faq','app'].forEach(function(id){var el=document.getElementById(id);if(el)obs.observe(el);});
}

/* ---------- sheets (floating overlays for secondary content) ---------- */
/* L4: opening a sheet remembers where focus was and moves it to the
   sheet's close button; closing restores it. Tab stays inside the open
   sheet (wrapping at both ends); Escape already closes. */
var sheetReturnFocus=null;
/* R1: the More sheet shows exactly one panel at a time — ChangeLock,
   Dispute (+ Close), Passport, Billing — picked by the segmented nav
   under the sheet head. */
function showMorePanel(name){
 ['change','dispute','passport','billing'].forEach(function(n){
  var p=$('tab-'+n); if(p)p.hidden=(n!==name);
 });
 var nav=$('more-nav');
 if(nav)nav.querySelectorAll('button[data-panel]').forEach(function(b){b.setAttribute('aria-selected',b.getAttribute('data-panel')===name?'true':'false');});
}
function morePanelForJob(){
 if(feePaidForJob[currentJobId]===true)return 'change';
 if(billingCache){var sub=billingCache.subscription||billingCache.sub||{};
  if(sub.active===true||sub.status==='ACTIVE'||billingCache.subscribed===true||billingCache.activeSubscription===true||billingCache.subscriptionActive===true)return 'change';}
 return 'billing';
}
function openSheet(id,panel){var el=$(id);if(!el)return;sheetReturnFocus=document.activeElement;el.hidden=false;if(id==='sheet-more'){showMorePanel(panel||'change');renderMoreResolvePack();}var c=el.querySelector('.sheet-close');if(c)c.focus();}
/* P2-7: ChangeLock is locked until the record is ACTIVE. The inputs and
   the submit are disabled and #change-locked explains why; on ACTIVE
   everything is enabled and the notice hides. With no job open (the
   global More button), the form is left as-is. */
function applyMoreLocks(job){
 var locked=!!(job&&job.status&&job.status!=='ACTIVE');
 var cl=$('change-locked'); if(cl)cl.hidden=!locked;
 var form=$('form-change'); if(!form)return;
 ['ch-delta','ch-deadline','ch-reason'].forEach(function(id){var el=$(id);if(el)el.disabled=locked;});
 var sub=form.querySelector('button[type="submit"]'); if(sub)sub.disabled=locked;
}
/* P2-10: ResolvePack discoverability — one row in the MORE modal for
   every job. ACTIVE/CLOSED/DISPUTED get Download PDF / Download JSON /
   Copy verify link, calling the same endpoints the suite checks
   (/resolvepack, /resolvepack.json, /api/verify?fp=). DRAFT/PENDING show
   the same row disabled with the reason. */
function resolvePackToken(){
 var link=(currentJob&&(currentJob.workerLink||currentJob.worker_link))||'';
 var tok=''; try{tok=new URL(link,location.href).searchParams.get('token')||'';}catch(e){}
 return tok;
}
function renderMoreResolvePack(){
 var row=$('more-resolvepack'); if(!row)return;
 var job=currentJob;
 if(!job){
  row.innerHTML='<b>ResolvePack</b><p class="small">Open a job to download its ResolvePack.</p>';
  return;
 }
 var st=job.status;
 var open=(st==='ACTIVE'||st==='CLOSED'||st==='DISPUTED');
 var ev=(job._full&&job._full.evidence)||job.evidence||null;
 var fp=ev&&ev.fingerprint;
 var verifyUrl=fp?(location.origin+'/verify?fp='+fp):'';
 var dis=open?'':' disabled';
 row.innerHTML='<b>ResolvePack</b><p class="small">'
  +(open?'The full record for this job — every version, payment and event.':'Not available yet — the record opens once both sides confirm.')
  +'</p><div class="btn-row">'
  +'<button class="btn btn-dark btn-sm" type="button" id="btn-more-rp-pdf"'+dis+'>Download PDF</button>'
  +'<button class="btn btn-dark-ghost btn-sm" type="button" id="btn-more-rp-json"'+dis+'>Download JSON</button>'
  +'<button class="btn btn-dark-ghost btn-sm" type="button" id="btn-more-rp-copy"'+dis+'>Copy verify link</button></div>';
 if(!open)return;
 var tok=resolvePackToken();
 var pdf=$('btn-more-rp-pdf');
 if(pdf)pdf.addEventListener('click',function(){window.open(API+'/api/jobs/'+encodeURIComponent(currentJobId)+'/resolvepack'+(tok?('?token='+encodeURIComponent(tok)):''),'_blank');});
 var jsn=$('btn-more-rp-json');
 if(jsn)jsn.addEventListener('click',function(){window.open(API+'/api/jobs/'+encodeURIComponent(currentJobId)+'/resolvepack.json'+(tok?('?token='+encodeURIComponent(tok)):''),'_blank');});
 var cp=$('btn-more-rp-copy');
 if(cp){
  if(verifyUrl)cp.setAttribute('data-verify-url',verifyUrl);
  cp.addEventListener('click',function(){
   if(!verifyUrl){showNotice(lang==='bn'?'যাচাই লিংক এখনো নেই।':'No verify link yet.');return;}
   if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(verifyUrl).then(function(){showNotice(t('receipt.copied'));},function(){showNotice(verifyUrl);});
   else showNotice(verifyUrl);
  });
 }
}
function closeSheets(){document.querySelectorAll('.sheet').forEach(function(el){el.hidden=true;});if(sheetReturnFocus&&document.contains(sheetReturnFocus)){try{sheetReturnFocus.focus();}catch(e){}}sheetReturnFocus=null;}
function initSheets(){
 var mn=$('more-nav');
 if(mn)mn.querySelectorAll('button[data-panel]').forEach(function(b){b.addEventListener('click',function(){showMorePanel(b.getAttribute('data-panel'));});});
 document.querySelectorAll('[data-sheet]').forEach(function(b){b.addEventListener('click',function(){
  openSheet(b.getAttribute('data-sheet'));
  var nav=document.getElementById('main-nav'); if(nav)nav.classList.remove('open');
  var mb=$('menu-btn'); if(mb)mb.setAttribute('aria-expanded','false'); });});
 document.querySelectorAll('.sheet [data-close]').forEach(function(b){b.addEventListener('click',closeSheets);});
 document.querySelectorAll('.sheet').forEach(function(sh){sh.addEventListener('click',function(ev){if(ev.target===sh)closeSheets();});});
 document.addEventListener('keydown',function(ev){if(ev.key==='Escape')closeSheets();});
 document.addEventListener('keydown',function(ev){
  if(ev.key!=='Tab')return;
  var open=null;
  document.querySelectorAll('.sheet').forEach(function(el){if(!el.hidden)open=el;});
  if(!open)return;
  var card=open.querySelector('.sheet-card'); if(!card)return;
  var f=card.querySelectorAll('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])');
  var list=[];for(var i=0;i<f.length;i++){if(!f[i].disabled&&f[i].offsetParent!==null)list.push(f[i]);}
  if(!list.length)return;
  var first=list[0],last=list[list.length-1];
  if(ev.shiftKey&&document.activeElement===first){ev.preventDefault();last.focus();}
  else if(!ev.shiftKey&&document.activeElement===last){ev.preventDefault();first.focus();}
 });
}

/* ---------- landing demo player: tap-through only, reaches Arrived ----------
   D3: the player starts paused on En route and moves only on Play/Next
   taps. It stops at the last state (Arrived); Play then reads Replay
   and restarts from En route. No auto-play. */
var demoStates=[
 {key:'en-route',pos:6,dist:{bn:'২.৪ কিমি দূরে · পৌঁছাতে ~৭ মিনিট',en:'2.4 km away · ETA ~7 min'}},
 {key:'arriving',pos:58,dist:{bn:'০.৬ কিমি দূরে · পৌঁছাতে ~২ মিনিট',en:'0.6 km away · ETA ~2 min'}},
 {key:'arrived',pos:92,dist:{bn:'কাজের জায়গায় পৌঁছেছে',en:'On site'}},
];
var demoIdx=0, demoTimer=null;
function demoRender(){
 var pill=$('demo-status'); if(!pill)return;
 var st=demoStates[demoIdx];
 pill.textContent=t('loc.'+({ 'en-route':'enRoute','arriving':'arriving','arrived':'arrived' }[st.key]||'enRoute'));
 var dot=$('demo-dot'); if(dot)dot.style.left='calc('+st.pos+'% - 9px)';
 var d=$('demo-dist'); if(d)d.textContent=st.dist[lang]||st.dist.en;
 var play=$('demo-play'); if(play)play.textContent=demoTimer?t('demo.pause'):(demoIdx>=demoStates.length-1?t('demo.replay'):t('demo.play'));
}
function demoStep(){
 if(demoIdx>=demoStates.length-1){if(demoTimer){clearInterval(demoTimer);demoTimer=null;}demoRender();return;}
 demoIdx++;
 if(demoIdx>=demoStates.length-1&&demoTimer){clearInterval(demoTimer);demoTimer=null;}
 demoRender();
}
function initDemoPlayer(){
 demoRender();
 var play=$('demo-play');
 if(play)play.addEventListener('click',function(){
  if(demoTimer){clearInterval(demoTimer);demoTimer=null;}
  else{if(demoIdx>=demoStates.length-1)demoIdx=0;demoTimer=setInterval(demoStep,2600);}
  demoRender();
 });
 var next=$('demo-next');
 if(next)next.addEventListener('click',function(){if(demoTimer){clearInterval(demoTimer);demoTimer=null;}demoStep();});
 var open=$('demo-open');
 if(open)open.addEventListener('click',loadDemo);
}

/* ---------- landing prompt box + hire choices ---------- */
/* L1: auto-growing prompt textareas — height auto, then the scrolled
   height capped at 156px, never below a 52px minimum. */
function autogrow(el){
 if(!el)return;
 el.style.minHeight='52px';
 el.style.height='auto';
 el.style.height=Math.min(el.scrollHeight,156)+'px';
}
function initPromptBox(){
 var inp=$('prompt-input');
 if(inp){
  inp.addEventListener('input',function(){autogrow(inp);promptChips($('prompt-chips'),parsePromptSafe(inp.value));});
  inp.addEventListener('keydown',function(ev){if(ev.key==='Enter'&&!ev.shiftKey){ev.preventDefault();startHire('direct');}});
  autogrow(inp);
 }
 var hd=$('hire-direct');
 if(hd)hd.addEventListener('click',function(){startHire('direct');});
 var hb=$('hire-bids');
 if(hb)hb.addEventListener('click',function(){
  if(!BIDDING_ON){showNotice(lang==='bn'?'দর এখন বন্ধ আছে।':'Bidding is off right now.');return;}
  startHire('bids'); });
 /* L3: "Start a record" only focuses the hero prompt box — it never
    jumps to login. Enter, or either hire choice, submits via startHire. */
 var cs=$('cta-start');
 if(cs)cs.addEventListener('click',function(){
  var pb=$('prompt-box'); if(pb)pb.scrollIntoView({behavior:RM?'auto':'smooth',block:'center'});
  if(inp)inp.focus({preventScroll:true});
 });
}

/* ---------- boot ---------- */
document.addEventListener('DOMContentLoaded',function(){
 initNavSpy();
 loadConfig();
 applyI18n();
 /* Mobile navigation: close on selection, outside tap or Escape. */
 var mb=$('menu-btn');
 var mainNav=document.getElementById('main-nav');
 function closeMobileNav(){
  if(mainNav)mainNav.classList.remove('open');
  if(mb)mb.setAttribute('aria-expanded','false');
 }
 if(mb)mb.addEventListener('click',function(){
  if(!mainNav)return;
  var open=mainNav.classList.toggle('open');
  mb.setAttribute('aria-expanded',open?'true':'false');
 });
 if(mainNav)mainNav.addEventListener('click',function(ev){
  if(ev.target&&ev.target.closest&&ev.target.closest('button'))closeMobileNav();
 });
 document.addEventListener('pointerdown',function(ev){
  if(mainNav&&mainNav.classList.contains('open')&&!(ev.target.closest&&ev.target.closest('.nav')))closeMobileNav();
 });
 document.addEventListener('keydown',function(ev){
  if(ev.key==='Escape')closeMobileNav();
 });
 $('lang-bn').addEventListener('click',function(){setLang('bn');});
 $('lang-en').addEventListener('click',function(){setLang('en');});
 renderDotMap($('map-footer'),{w:560,h:300,step:15});
 /* No journey map: the dotted map lives only in the footer now. */
 initJourney(); initAuth(); initNewJob(); initDetail(); initBidding(); renderFairScope();
 /* P0/P2/P4 motion: hero tilt, price count-ups, photo lightbox. */
 initHeroTilt(); initPriceMotion(); initLightbox();
 /* Motion gaps: FAQ accordion, sliding tab indicator, hero-entrance
    cancel, scroll-reveal stagger. */
 initFaq(); initTabInd(); initHeroEntrance(); initStagger();
 initSheets(); initDemoPlayer(); initPromptBox(); initJobsTabs();
 var bh=$('brand-home');
 if(bh)bh.addEventListener('click',function(ev){ev.preventDefault();closeSheets();showLanding();});
 var bhome=$('btn-home');
 if(bhome)bhome.addEventListener('click',function(){closeSheets();showLanding();});
 var navApp=$('nav-app');
 if(navApp)navApp.addEventListener('click',function(){
  closeSheets();
  if(mainNav)mainNav.classList.remove('open');
  if(mb)mb.setAttribute('aria-expanded','false');
  if(token){showView('view-jobs');loadJobs();}else showView('view-login');
 });
 var bmg=$('btn-more-global');
 if(bmg)bmg.addEventListener('click',function(){openSheet('sheet-more');loadBillingStatus();});
 var bmj=$('btn-more-job');
 if(bmj)bmj.addEventListener('click',function(){openSheet('sheet-more',morePanelForJob());loadBillingStatus();});
 var dr=$('demo-restart'); if(dr)dr.addEventListener('click',restartDemo);
 var de=$('demo-exit'); if(de)de.addEventListener('click',exitDemo);
 $('cta-demo').addEventListener('click',loadDemo);
 if(token){
  /* Validate the stored token: a new OTP for the same phone rotates it.
     A valid token opens straight into the app; an expired one leaves the
     visitor on the landing screen (the app opens on "Start a record"). */
  api('/api/me').then(function(r){if(r&&r.user){user=r.user;localStorage.setItem('dc_user',JSON.stringify(user));}showView('view-jobs');loadJobs();})
  .catch(function(){token='';user=null;localStorage.removeItem('dc_token');localStorage.removeItem('dc_user');});
 }
 /* No token: stay on the landing screen. The app opens on "Start a record". */
 if('serviceWorker' in navigator){navigator.serviceWorker.register('sw.js').catch(function(){});}
});
})();
