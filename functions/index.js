const functions = require("firebase-functions");

const admin = require("firebase-admin");
admin.initializeApp();

exports.notifyNewMessage = functions.firestore
  .document("chatChannels/{channel}/messages/{message}")
  .onCreate((docSnapshot, context) => {
    const message = docSnapshot.data();
    const { recipientId, senderName } = message;

    return admin
      .firestore()
      .doc(`users/${recipientId}`)
      .get()
      .then(userDoc => {
        const registrationTokens = userDoc.get("registrationTokens");

        const notificationBody =
          message["type"] === "TEXT"
            ? message["text"]
            : "You received a new image message";
        const payload = {
          notification: {
            title: senderName + " sent you a message",
            body: notificationBody,
            clickAction: "ChatActivity"
          },
          data: {
            USER_NAME: senderName,
            USER_ID: message["senderId"]
          }
        };

        //sync tokens inside
        // eslint-disable-next-line promise/no-nesting
        return admin
          .messaging()
          .sendToDevice(registrationTokens, payload)
          .then(response => {
            const stillRegisteredTokens = registrationTokens;

            response.results.forEach((result, index) => {
              const error = result.error;
              if (error) {
                const failedRegistrationToken = registrationTokens[index];
                console.error(
                  "fail to send notification",
                  failedRegistrationToken,
                  error
                );
                if (
                  error.code === "messaging/invalid-registration-token" ||
                  error.code === "messageing/registration-token-not-registered"
                ) {
                  const failedIndex = stillRegisteredTokens.indexOf(
                    failedRegistrationToken
                  );
                  if (failedIndex > -1) {
                    stillRegisteredTokens.splice(failedIndex, 1);
                  }
                }
              }
            });
            return admin
              .firestore()
              .doc(`users/${recipientId}`)
              .update({
                registrationTokens: stillRegisteredTokens
              });
          });
      });
  });
