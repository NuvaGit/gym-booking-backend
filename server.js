const express = require("express");
const { chromium, firefox, webkit } = require("playwright");
const cors = require("cors");

const app = express();

// --- CORS Configuration ---
const corsOptions = {
  origin: ["https://nuvagit.github.io", "http://localhost:3000", "http://localhost:5173"], // Allow frontend origins
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions)); // Enable preflight requests for all routes
app.use(express.json());

// --- Test Route to Ensure Server is Running ---
app.get("/", (req, res) => {
  res.send("UCD Gym Booking Server is running!");
});

const URL = "https://hub.ucd.ie/usis/W_HU_MENU.P_PUBLISH?p_tag=GYMBOOK";
const REFRESH_INTERVAL = 1000; // 1 second refresh interval

// Utility function to collect and return logs
function createLogger() {
  const logs = [];
  return {
    log: (message) => {
      const timestamp = new Date().toLocaleTimeString();
      const formattedMessage = `[${timestamp}] ${message}`;
      console.log(formattedMessage);
      logs.push(formattedMessage);
    },
    getLogs: () => logs
  };
}

app.post("/book", async (req, res) => {
  const { username, browserType = "chromium" } = req.body;
  const logger = createLogger();

  if (!username) {
    return res.status(400).json({ 
      success: false, 
      message: "⚠️ Username is required!",
      logs: logger.getLogs()
    });
  }

  let browser;

  try {
    logger.log(`🔄 Launching Playwright with ${browserType}...`);

    // Browser-specific launch options
    const launchOptions = { 
      headless: true
    };

    // Add browser-specific configurations
    if (browserType === "chromium") {
      launchOptions.args = [
        '--disable-dev-shm-usage',
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu'
      ];
    }

    // Launch the browser dynamically based on user input
    if (browserType === "firefox") {
      browser = await firefox.launch(launchOptions);
    } else if (browserType === "webkit") {
      browser = await webkit.launch(launchOptions);
    } else {
      browser = await chromium.launch(launchOptions);
    }

    // Create context with viewport and user agent
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.110 Safari/537.36'
    });

    const page = await context.newPage();
    
    // Add timeout for page navigation
    page.setDefaultTimeout(30000); // 30 seconds
    
    logger.log("🌐 Navigating to UCD Gym booking page...");
    await page.goto(URL, { waitUntil: "networkidle" });

    logger.log("✅ Page loaded, checking for available slots...");
    let bookingConfirmed = false;
    let attemptCount = 0;
    const MAX_ATTEMPTS = 10; // Limit the number of attempts

    while (!bookingConfirmed && attemptCount < MAX_ATTEMPTS) {
      attemptCount++;
      logger.log(`🔄 Attempt ${attemptCount} of ${MAX_ATTEMPTS}`);
      
      await page.reload({ waitUntil: "networkidle" });
      logger.log("🔄 Page refreshed");

      // Accept cookies if the popup appears
      try {
        const cookiesButton = page.locator("button:text('Accept')");
        if (await cookiesButton.isVisible({ timeout: 2000 })) {
          await cookiesButton.click();
          logger.log("✅ Accepted cookies");
          await page.waitForTimeout(500);
        }
      } catch (err) {
        logger.log("ℹ️ No cookies popup found or already accepted");
      }

      // Look for available slots (check for <a> links)
      const slots = await page.locator("table tr a").all();
      
      if (slots.length === 0) {
        logger.log("❌ No available booking slots. Refreshing...");
        await page.waitForTimeout(REFRESH_INTERVAL);
        continue;
      }
      
      logger.log(`✅ Found ${slots.length} available booking slots`);
      
      // Click the first available booking link
      try {
        // Get the text of the slot for better logging
        const slotText = await slots[0].textContent();
        logger.log(`🎯 Attempting to book: ${slotText.trim()}`);
        
        await slots[0].click();
        logger.log("✅ Clicked booking slot");
        
        // Wait for navigation or new page elements
        await page.waitForTimeout(1000);
        
      } catch (err) {
        logger.log(`⚠️ Error clicking booking slot: ${err.message}`);
        continue;
      }

      // Enter username
      try {
        const usernameField = page.locator("input[type='text']");
        await usernameField.waitFor({ state: 'visible', timeout: 5000 });
        await usernameField.fill("");  // Clear first
        await usernameField.fill(username);
        logger.log(`✅ Entered username: ${username}`);
        await page.waitForTimeout(500);
      } catch (err) {
        logger.log(`⚠️ Username input field not found: ${err.message}`);
        continue;
      }

      // Click "Proceed with Booking"
      try {
        const proceedButton = page.locator("input[type='submit']:has-text('Proceed'), button:has-text('Proceed'), a:has-text('Proceed')");
        await proceedButton.waitFor({ state: 'visible', timeout: 5000 });
        await proceedButton.click();
        logger.log("✅ Clicked 'Proceed with Booking'");
        await page.waitForTimeout(1000);
      } catch (err) {
        logger.log(`⚠️ 'Proceed with Booking' button not found: ${err.message}`);
        continue;
      }

      // Check for any error messages
      try {
        const errorMessage = await page.locator(".error-message, .alert-danger, div[role='alert']").textContent();
        if (errorMessage) {
          logger.log(`⚠️ Error from website: ${errorMessage}`);
          continue;
        }
      } catch (err) {
        // No error message found, proceed
      }

      // Click "Confirm Booking"
      try {
        const confirmButton = page.locator("input[type='submit']:has-text('Confirm'), button:has-text('Confirm'), a:has-text('Confirm')");
        await confirmButton.waitFor({ state: 'visible', timeout: 5000 });
        await confirmButton.click();
        logger.log("🎉 Booking confirmed!");
        
        // Wait for confirmation page
        await page.waitForTimeout(1000);
        
        // Try to get confirmation details
        try {
          const confirmationText = await page.locator("body").textContent();
          if (confirmationText.includes("confirm") || confirmationText.includes("success")) {
            logger.log("✅ Confirmation page loaded successfully");
            // Take a screenshot of the confirmation for debugging
            // await page.screenshot({ path: 'confirmation.png' });
          }
        } catch (err) {
          logger.log("⚠️ Could not verify confirmation page");
        }
        
        bookingConfirmed = true;
      } catch (err) {
        logger.log(`⚠️ 'Confirm Booking' button not found: ${err.message}`);
      }
    }

    await browser.close();
    
    if (bookingConfirmed) {
      return res.json({ 
        success: true, 
        message: "🎉 Booking Confirmed! Your gym session has been booked successfully.",
        logs: logger.getLogs()
      });
    } else {
      return res.json({ 
        success: false, 
        message: "⚠️ Maximum attempts reached without successful booking.",
        logs: logger.getLogs()
      });
    }
    
  } catch (error) {
    logger.log(`❌ Error during booking: ${error.message}`);
    
    if (browser) {
      try {
        await browser.close();
      } catch (closeError) {
        logger.log(`⚠️ Error closing browser: ${closeError.message}`);
      }
    }
    
    res.status(500).json({ 
      success: false, 
      message: `❌ Booking failed: ${error.message}`, 
      logs: logger.getLogs() 
    });
  }
});

// AWS Lambda friendly handler
if (process.env.AWS_LAMBDA_FUNCTION_NAME) {
  // For Lambda, export the Express app
  module.exports = app;
} else {
  // For local development, start the server
  const PORT = process.env.PORT || 10000;
  app.listen(PORT, () => console.log(`🚀 Backend running on port ${PORT}`));
}