const express = require("express");
const puppeteer = require("puppeteer");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

const URL = "https://hub.ucd.ie/usis/W_HU_MENU.P_PUBLISH?p_tag=GYMBOOK";
const REFRESH_INTERVAL = 1000;

app.post("/book", async (req, res) => {
  const { username } = req.body;

  if (!username) {
    return res.status(400).json({ success: false, message: "Username is required!" });
  }

  try {
    console.log("🔄 Launching Puppeteer...");

    // Updated: Specify executablePath using environment variable or fallback to a default path.
    const browser = await puppeteer.launch({
      headless: true,
      executablePath: process.env.CHROME_BIN || '/usr/bin/google-chrome-stable',
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-gpu",
        "--disable-dev-shm-usage",
      ],
    });

    const page = await browser.newPage();
    await page.goto(URL, { waitUntil: "networkidle2" });

    console.log("✅ Page loaded, checking for available slots...");

    let bookingConfirmed = false;

    while (!bookingConfirmed) {
      await page.reload({ waitUntil: "networkidle2" });
      console.log("🔄 Page refreshed");

      // Accept cookies if the popup appears
      try {
        const cookiesButton = await page.$x("//button[contains(text(), 'Accept')]");
        if (cookiesButton.length > 0) {
          await cookiesButton[0].click();
          console.log("✅ Accepted cookies");
        }
      } catch (err) {
        console.log("No cookies popup found.");
      }

      // Look for available slots (check for <a> links)
      const slots = await page.$$("table tr a");
      if (slots.length === 0) {
        console.log("❌ No available booking slots. Refreshing...");
        await new Promise((resolve) => setTimeout(resolve, REFRESH_INTERVAL));
        continue;
      }

      // Click the first available booking link
      await slots[0].click();
      console.log("✅ Clicked booking slot");

      await page.waitForTimeout(500);

      // Enter username
      try {
        await page.waitForSelector("input[type='text']", { timeout: 5000 });
        await page.type("input[type='text']", username);
        console.log(`✅ Entered username: ${username}`);
      } catch (err) {
        console.log("⚠ Username input field not found.");
        continue;
      }

      // Click "Proceed with Booking"
      try {
        const proceedButton = await page.$x("//input[@type='submit' and contains(@value, 'Proceed')] | //button[contains(text(), 'Proceed')] | //a[contains(text(), 'Proceed')]");
        if (proceedButton.length > 0) {
          await proceedButton[0].click();
          console.log("✅ Clicked 'Proceed with Booking'");
        }
      } catch (err) {
        console.log("⚠ 'Proceed with Booking' button not found.");
        continue;
      }

      await page.waitForTimeout(500);

      // Click "Confirm Booking"
      try {
        const confirmButton = await page.$x("//input[@type='submit' and contains(@value, 'Confirm')] | //button[contains(text(), 'Confirm')] | //a[contains(text(), 'Confirm')]");
        if (confirmButton.length > 0) {
          await confirmButton[0].click();
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
    console.error("❌ Error:", error);
    res.status(500).json({ success: false, message: "❌ Booking failed." });
  }
});

// Start server
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Backend running on port ${PORT}`));
