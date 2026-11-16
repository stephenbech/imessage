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
                  const email =
                        clerkUser.emailAddresses.find(
                              ({ id }) =>
                                    id === clerkUser.primaryEmailAddressId,
                        )?.emailAddress ??
                        clerkUser.emailAddresses[0]?.emailAddress;

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
                                    new: true,
                                    upsert: true,
                                    setDefaultsOnInsert: true,
                              },
                        );
                  } catch (error) {
                        // A concurrent request may have created the same profile first.
                        if (error.code !== 11000) throw error;
                        user = await User.findOne({ clerkId: userId });
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
