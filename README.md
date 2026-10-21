# Hisab360 7.2.1

Latest APK: `OUTPUT/Hisab360-v7.2.1-DEBUG.apk`. Yeh debug key se signed hai. Release build ke liye apni original signing key/backup use karein.

## Zaroori files

`www` app source hai; `android` Android project; `resources` launcher icons; `node_modules` installed dependencies; `tests` financial/security checks. Package files, Capacitor/Vite configuration aur Firebase rules/indexes build ke liye zaroori hain.

## Build

Java 21, Android SDK aur Node.js chahiye. Debug APK:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/build-debug.ps1
```

Release builder: `BUILD-HISAB360.bat`. Existing app ke updates ke liye original signing key chahiye. Signing backup mehfooz rakhein.

Web preview: `npm run dev`; web build: `npm run build:web`. Source HTML ko directly open na karein.

Checks: `npm test`; Java 21 ke saath `npm run test:rules`.

Firebase project: `self-data-base`. Rules deploy: `npx firebase deploy --only firestore:rules --project self-data-base`.

## App

Email verification signup/approval se pehle zaroori hai. Firebase Authentication passwords manage karta hai. Master doosre users ka private profile ya financial data access nahi kar sakta; Firebase Console/IAM access alag hai.

Deleted workspace 30 din owner restore kar sakta hai, aakhri workspace bhi. Login recovery ke liye rehta hai. Expired records ki cleanup owner app dobara chalne par hoti hai.

Har 7 din JSON backup `Documents/Hisab360/Backups` mein save hota hai. App band ho to overdue backup next open par hota hai; internet chahiye. Drive par save phone ke share menu se hota hai. Restore: Settings → Deleted Accounts ya Backup & Restore.

Build folders/cache aur `dist` dobara build par ban jayenge. Latest APK, source, Android configuration aur dependencies preserve kiye gaye hain.
