const express = require("express");
const { chromium, firefox, webkit } = require("playwright");
const cors = require("cors");

const app = express();

// --- CORS Configuration ---
const corsOptions = {
  origin: "https://nuvagit.github.io", // Allow only your frontend's origin
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions)); // Enable preflight requests for all routes
app.use(express.json());

// --- Test Route to Ensure Server is Running ---
app.get("/", (req, res) => {
  res.send("Server is running!");
});

const URL = "https://hub.ucd.ie/usis/W_HU_MENU.P_PUBLISH?p_tag=GYMBOOK";
const REFRESH_INTERVAL = 1000;

app.post("/book", async (req, res) => {
  const { username, browserType = "chromium" } = req.body;

  if (!username) {
    return res.status(400).json({ success: false, message: "Username is required!" });
  }

  let browser;

  try {
    console.log(`🔄 Launching Playwright with ${browserType}...`);

    // Launch the browser dynamically based on user input (default: Chromium)
    if (browserType === "firefox") {
      browser = await firefox.launch({ headless: true });
    } else if (browserType === "webkit") {
      browser = await webkit.launch({ headless: true }); // WebKit for Safari/iPhones
    } else {
      browser = await chromium.launch({ headless: true });
    }

    const page = await browser.newPage();
    await page.goto(URL, { waitUntil: "networkidle" });

    console.log("✅ Page loaded, checking for available slots...");
    let bookingConfirmed = false;

    while (!bookingConfirmed) {
      await page.reload({ waitUntil: "networkidle" });
      console.log("🔄 Page refreshed");

      // Accept cookies if the popup appears
      try {
        const cookiesButton = await page.locator("button:text('Accept')").first();
        if (await cookiesButton.isVisible()) {
          await cookiesButton.click();
          console.log("✅ Accepted cookies");
        }
      } catch (err) {
        console.log("No cookies popup found.");
      }

      // Look for available slots (check for <a> links)
      const slots = await page.locator("table tr a").all();
      if (slots.length === 0) {
        console.log("❌ No available booking slots. Refreshing...");
        await page.waitForTimeout(REFRESH_INTERVAL);
        continue;
      }

      // Click the first available booking link
      await slots[0].click();
      console.log("✅ Clicked booking slot");

      await page.waitForTimeout(500);

      // Enter username
      try {
        await page.locator("input[type='text']").waitFor({ timeout: 5000 });
        await page.fill("input[type='text']", username);
        console.log(`✅ Entered username: ${username}`);
      } catch (err) {
        console.log("⚠ Username input field not found.");
        continue;
      }

      // Click "Proceed with Booking"
      try {
        const proceedButton = page.locator("input[type='submit']:has-text('Proceed'), button:has-text('Proceed'), a:has-text('Proceed')");
        if (await proceedButton.isVisible()) {
          await proceedButton.click();
          console.log("✅ Clicked 'Proceed with Booking'");
        }
      } catch (err) {
        console.log("⚠ 'Proceed with Booking' button not found.");
        continue;
      }

      await page.waitForTimeout(500);

      // Click "Confirm Booking"
      try {
        const confirmButton = page.locator("input[type='submit']:has-text('Confirm'), button:has-text('Confirm'), a:has-text('Confirm')");
        if (await confirmButton.isVisible()) {
          await confirmButton.click();
          console.log("🎉 Booking confirmed!");
          bookingConfirmed = true;
        }
      } catch (err) {
        console.log("⚠ 'Confirm Booking' button not found.");
      }
    }

    await browser.close();
    res.json({ success: true, message: "🎉 Booking Confirmed!" });
  } catch (error) {
    console.error("❌ Error during booking:", error);
    if (browser) await browser.close();
    res.status(500).json({ success: false, message: `❌ Booking failed: ${error.message}` });
  }
});

// --- Start the server ---
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Backend running on port ${PORT}`));
