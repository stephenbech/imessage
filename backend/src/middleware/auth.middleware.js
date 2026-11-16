import { clerkClient, getAuth } from "@clerk/express";
import User from "../models/user.model.js";

export async function protectRoute(req, res, next) {
      try {
            const { userId } = getAuth(req);

            if (!userId) {
                  return res.status(401).json({ message: "Unauthorized" });
            }

            let user = await User.findOne({ clerkId: userId });

            // Webhooks may not be configured for local development, or may arrive after
            // the first authenticated API request. Recover the profile directly from
            // Clerk rather than making every protected endpoint fail until then.
            if (!user) {
                  const clerkUser = await clerkClient.users.getUser(userId);
                  const primaryEmail =
                        clerkUser.emailAddresses.find(
                              ({ id }) =>
                                    id === clerkUser.primaryEmailAddressId,
                        ) ?? clerkUser.emailAddresses[0];
                  const email = primaryEmail?.emailAddress;
                  const emailIsVerified =
                        primaryEmail?.verification?.status === "verified";

                  if (!email) {
                        return res.status(422).json({
                              message: "Your Clerk account needs an email address",
                        });
                  }

                  const fullName =
                        [clerkUser.firstName, clerkUser.lastName]
                              .filter(Boolean)
                              .join(" ") ||
                        clerkUser.username ||
                        email.split("@")[0];

                  try {
                        user = await User.findOneAndUpdate(
                              { clerkId: userId },
                              {
                                    $set: {
                                          email,
                                          fullName,
                                          profilePic: clerkUser.imageUrl || "",
                                    },
                                    $setOnInsert: { clerkId: userId },
                              },
                              {
                                    returnDocument: "after",
                                    upsert: true,
                                    setDefaultsOnInsert: true,
                              },
                        );
                  } catch (error) {
                        // A concurrent request may have created the same profile first,
                        // or an older profile may already own this verified email.
                        if (error.code !== 11000) throw error;
                        user = await User.findOne({ clerkId: userId });

                        if (!user && emailIsVerified) {
                              user = await User.findOneAndUpdate(
                                    { email },
                                    {
                                          $set: {
                                                clerkId: userId,
                                                fullName,
                                                profilePic:
                                                      clerkUser.imageUrl || "",
                                          },
                                    },
                                    { returnDocument: "after" },
                              );
                        }

                        if (!user) throw error;
                  }
            }

            req.user = user;
            return next();
      } catch (error) {
            console.error("Error in protectRoute middleware:", error.message);
            return res.status(500).json({ message: "Internal Server Error" });
      }
}
