import admin from 'firebase-admin';

function initAdmin() {
  if (admin.apps.length > 0) return admin;

  const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!serviceAccount) {
    console.warn(
      '[firebase-admin] FIREBASE_SERVICE_ACCOUNT is not set. ' +
      'Auth verification will be disabled. Set this in production.'
    );
    admin.initializeApp({
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    });
    return admin;
  }

  try {
    admin.initializeApp({
      credential: admin.credential.cert(JSON.parse(serviceAccount)),
    });
  } catch (e) {
    throw new Error(`Failed to initialize Firebase Admin: ${e.message}`);
  }

  return admin;
}

export default initAdmin();
