require("dotenv").config();
const express = require("express");
const axios = require("axios");
const cors = require("cors");
const app = express();

app.use(express.json());
app.use(cors());

// ------------------ In-Memory Token Store ------------------
const tokenStore = {}; // { portalId: { accessToken, refreshToken, expiresAt } }

// ------------------ Helper Functions ------------------

// Get access token (refresh if expired)
const getAccessToken = async (userlId) => {
  const tokens = tokenStore[userlId];
  if (!tokens) throw new Error("App not installed");

  // Refresh if expired
  if (Date.now() > tokens.expiresAt) {
    const body = {
      grant_type: "refresh_token",
      client_id: process.env.CLIENT_ID,
      client_secret: process.env.CLIENT_SECRET,
      refresh_token: tokens.refreshToken,
    };

    const response = await axios.post(
      "https://api.hubapi.com/oauth/v1/token",
      new URLSearchParams(body),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
    );

    const data = response.data;
    tokens.accessToken = data.access_token;
    tokens.expiresAt = Date.now() + data.expires_in * 1000;
  }

  return tokens.accessToken;
};

// ------------------ Routes ------------------

// 1️⃣ Install route → redirects user to HubSpot OAuth
app.get("/install", (req, res) => {
  const authUrl =
    "https://app.hubspot.com/oauth/authorize" +
    `?client_id=${encodeURIComponent(process.env.CLIENT_ID)}` +
    `&scope=${encodeURIComponent(process.env.SCOPES)}` +
    `&redirect_uri=${encodeURIComponent(process.env.REDIRECT_URI)}`;

  res.redirect(authUrl);
});

// 3️⃣ Main route → clicked by modal “Click Me” button
app.post("/", async (req, res) => {
  const message = req.body.message;
  const id = req.body.contactId;
  try {
    const accessToken = await getAccessToken(id); // retrive access Token

    // Patch contact
    const response = await axios.patch(
      `https://api.hubapi.com/crm/v3/objects/contacts/${id}`,
      { properties: { message: message } },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      }
    );

    res.json({
      success: true,
      hubspot: response.data,
    });
  } catch (error) {
    console.error(error.response?.data || error.message);
    res.json({
      success: false,
      message: error.response?.data || error.message,
    });
  }
});

// Add this route before your other routes
// 2️⃣ OAuth callback → exchange code for access & refresh tokens
app.get("/", async (req, res) => {
  const { code, hub_id } = req.query;

  // If no code, show welcome page
  if (!code) {
    return res.send(`
      <h1>HubSpot SMS App Backend</h1>
      <p>Server is running!</p>
      <p><a href="/install">Click here to install the app</a></p>
    `);
  }

  // Handle OAuth callback
  try {
    const body = {
      grant_type: "authorization_code",
      client_id: process.env.CLIENT_ID,
      client_secret: process.env.CLIENT_SECRET,
      redirect_uri: process.env.REDIRECT_URI,
      code: code,
    };

    const response = await axios.post(
      "https://api.hubapi.com/oauth/v1/token",
      new URLSearchParams(body),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
    );

    const data = response.data;

    // Store tokens in memory using hub_id (portalId)
    const portalId = hub_id || "default";
    tokenStore[userId] = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: Date.now() + data.expires_in * 1000,
    };

    res.redirect("https://app-na2.hubspot.com/");
  } catch (error) {
    console.error(error.response?.data || error.message);
    res.send(
      "Error exchanging code for token: " +
        (error.response?.data || error.message)
    );
  }
});

app.listen(3000, () => {
  console.log("Server is running on port 5000");
});
