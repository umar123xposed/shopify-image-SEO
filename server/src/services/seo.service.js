const axios = require('axios');
const FormData = require('form-data');
const { Readable } = require('stream');
const Progress = require('../models/progress.model');

class SEOService {
  constructor(userId, shopName, shopifyKey, geminiKey) {
    this.userId = userId;
    this.shopName = shopName;
    this.shopifyKey = shopifyKey;
    this.geminiKey = geminiKey;
    
    this.isRunning = false;
    this.totalProducts = 0;
    this.completedProducts = 0;
    this.currentProduct = null;
    this.currentImage = null;
    this.processedImages = [];
    this.maxProcessedImages = 5;
    this.onProgress = null;
    this.processedProductIds = new Set(); // Track processed product IDs
    
    // Add error tracking
    this.apiErrorCount = 0;
    this.maxApiErrors = 3; // Stop after 3 consecutive API errors
    this.lastError = null;
  }

  // Load progress from database
  async loadProgress() {
    try {
      let progress = await Progress.findOne({ userId: this.userId });
      if (!progress) {
        progress = new Progress({
          userId: this.userId,
          shopName: this.shopName,
          lastProductId: null,
          completedProducts: 0,
          totalProducts: 0,
          isRunning: false,
          processedProductIds: [] // Add this field
        });
        await progress.save();
      }
      return {
        lastProductId: progress.lastProductId,
        completedProducts: progress.completedProducts || 0,
        totalProducts: progress.totalProducts || 0,
        isRunning: progress.isRunning || false,
        processedProductIds: progress.processedProductIds || [], // Return processed IDs
        currentProductId: progress.currentProductId,
        currentProductTitle: progress.currentProductTitle,
        currentImage: progress.currentImage
      };
    } catch (error) {
      console.error("Error loading progress:", error);
      return { 
        lastProductId: null,
        completedProducts: 0,
        totalProducts: 0,
        isRunning: false,
        processedProductIds: [],
        currentProductId: null,
        currentProductTitle: null,
        currentImage: null
      };
    }
  }

  // Save progress to database
  async saveProgress(productId) {
    try {
      await Progress.findOneAndUpdate(
        { userId: this.userId },
        { 
          lastProductId: productId,
          completedProducts: this.completedProducts,
          totalProducts: this.totalProducts,
          isRunning: this.isRunning,
          currentProduct: this.currentProduct,
          processedImages: this.processedImages.slice(0, this.maxProcessedImages),
          processedProductIds: Array.from(this.processedProductIds), // Save processed IDs
          updatedAt: new Date()
        },
        { upsert: true }
      );
    } catch (error) {
      console.error("Error saving progress:", error);
    }
  }

  // Fetch all products from Shopify
  async fetchProducts() {
    let allProducts = [];
    let nextPageUrl = `https://${this.shopName}.myshopify.com/admin/api/2024-01/products.json?limit=50`;

    try {
      while (nextPageUrl) {
        const response = await axios.get(nextPageUrl, {
          headers: { "X-Shopify-Access-Token": this.shopifyKey },
        });

        allProducts = [...allProducts, ...response.data.products];

        // Check for pagination
        const linkHeader = response.headers["link"];
        if (linkHeader) {
          const match = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
          nextPageUrl = match ? match[1] : null;
        } else {
          nextPageUrl = null;
        }
      }

      console.log(`✅ Fetched ${allProducts.length} products from Shopify.`);
      return allProducts;
    } catch (error) {
      console.error("❌ Error fetching products:", error.message);
      return [];
    }
  }

  // Download image as buffer instead of base64
  async downloadImage(imageUrl) {
    try {
      const response = await axios.get(imageUrl, { responseType: 'arraybuffer' });
      return response.data;
    } catch (error) {
      console.error("❌ Error downloading image:", error.message);
      return null;
    }
  }

  // Convert buffer to stream
  bufferToStream(buffer) {
    return Readable.from(buffer);
  }

  // Get image description from Gemini AI
  async getImageDescription(base64Image, productTitle, productDescription) {
    try {
      const prompt = `
You are an expert in e-commerce SEO and product listing optimization.
Your task is to analyze the given image with respect to its already uploaded product title and its description which is uploaded on shopify and generate:
  1️⃣ AltText: A highly descriptive, SEO-friendly alt text (125 characters max).
  2️⃣ Filename: A short, keyword-rich filename (no spaces, no special characters, no file extension).

### **Guidelines for Alt Text**:
✅ Clearly describe the main subject of the image with respect to its product title and product description 
✅ Include relevant attributes such as **color, material, size, usage, and unique features**.  
✅ Use a natural, human-readable sentence structure.  
✅ Keep it **concise** and **highly relevant** to e-commerce SEO.  
✅ **DO NOT** start with "Image of" or "Picture of".  
✅ **DO NOT** use generic terms like "Product", "Item", or "Photo".  
✅ **DO NOT** add excessive words; focus on what truly matters.

### **Guidelines for Filename**:
✅ Create a **short and keyword-optimized filename**.  
✅ Use **hyphens (-) instead of spaces**.  
✅ Focus on **high-ranking search terms** related to the product.  
✅ **DO NOT** use unnecessary words like "photo", "image", or "screenshot".  
✅ **DO NOT** include the file extension (.jpg, .png, etc.).  
✅ **DO NOT** use special characters, only letters, numbers, and hyphens.

### **Example Outputs**:
📌 **Example 1 (Red Sneakers)**  
- Alt Text: "Stylish red canvas sneakers with white laces, rubber sole, and breathable fabric."  
- Filename: "red-canvas-sneakers-white-laces"

📌 **Example 2 (Handbag)**  
- Alt Text: "Elegant black leather handbag with gold chain strap, quilted design, and compact size."  
- Filename: "black-leather-handbag-gold-strap"

📌 **Example 3 (Plush Toy)**  
- Alt Text: "Adorable red panda plush toy with soft fur, lifelike facial details, and fluffy tail."  
- Filename: "red-panda-plush-soft-toy"

🔍 **Now analyze the following image carefully and generate the best possible SEO-optimized alt text and filename.**  
** your reponse should only be in this format(nothing more nothing less):
AltText: <description>
Filename: <name> (WITHOUT .jpg extension)**
`;

      const response = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${this.geminiKey}`,
        {
          contents: [
            {
              parts: [
                { text: prompt },
                { text: productTitle },
                { text: productDescription },
                { inline_data: { mime_type: "image/jpeg", data: base64Image } },
              ],
            },
          ],
        },
        { headers: { "Content-Type": "application/json" } }
      );

      const textResponse = response.data.candidates[0].content.parts[0].text;
      console.log(`🧠 Raw AI Response:\n${textResponse}`);

      const match = textResponse.match(/AltText:\s*(.*?)\s*\nFilename:\s*(.*)/i);
      if (!match) {
        console.warn(`⚠️ Unexpected AI response format: ${textResponse}`);
        return { error: 'Invalid AI response format' };
      }

      let altText = match[1].trim();
      let fileName = match[2].trim().replace(/\s+/g, "-").replace(/[^a-zA-Z0-9-]/g, "").toLowerCase();

      return { success: true, altText, fileName };
    } catch (error) {
      console.error("❌ Error fetching AI-generated alt text and filename:", error.message);
      return { error: error.message };
    }
  }

  async getAIGeneratedContent(image, product) {
    try {
      const imageBuffer = await this.downloadImage(image.src);
      if (!imageBuffer) {
        return { error: 'Failed to download image' };
      }

      const base64Image = Buffer.from(imageBuffer).toString('base64');
      const result = await this.getImageDescription(base64Image, product.title, product.body_html);
      
      if (result.error) {
        return { error: result.error };
      }

      return {
        success: true,
        newAltText: result.altText,
        newFilename: result.fileName
      };
    } catch (error) {
      console.error('AI Generation Error:', error);
      return { error: error.message };
    }
  }

  async processImage(image, product) {
    try {
      if (!this.isRunning) {
        return { success: false, error: 'Process stopped' };
      }

      const result = await this.getAIGeneratedContent(image, product);
      
      if (result.error) {
        // Check for API errors
        if (result.error.includes('429') || result.error.includes('401')) {
          this.apiErrorCount++;
          console.log(`API Error count: ${this.apiErrorCount}/${this.maxApiErrors}`);

          if (this.apiErrorCount >= this.maxApiErrors) {
            // Stop the process but don't crash
            await this.forceStop('Process stopped: Multiple API errors occurred. Please check your API key and restart the process.');
            return { 
              success: false, 
              error: 'API key error - process stopped', 
              apiKeyError: true 
            };
          }
        }
        return { success: false, error: result.error };
      }

      // If we got here, reset error count since AI request succeeded
      this.apiErrorCount = 0;

      return {
        success: true,
        ...result
      };

    } catch (error) {
      console.error('Process Image Error:', error);
      return { 
        success: false, 
        error: error.message 
      };
    }
  }

  async forceStop(errorMessage) {
    this.isRunning = false;
    this.apiErrorCount = 0; // Reset error count
    
    // Update database to reflect stopped state and save current product info
    try {
      await Progress.findOneAndUpdate(
        { userId: this.userId },
        { 
          isRunning: false,
          currentProductId: this.currentProduct ? this.currentProduct.id : null,
          currentProductTitle: this.currentProduct,
          lastProductId: this.lastProcessedProductId,
          completedProducts: this.completedProducts,
          currentImage: this.currentImage,
          error: errorMessage,
          lastError: errorMessage,
          apiErrorCount: 0 // Reset error count in database
        },
        { upsert: true }
      );
    } catch (error) {
      console.error("Error updating stop status in database:", error);
    }
    
    this.updateProgress();
  }

  async stop() {
    await this.forceStop('Process stopped by user');
  }

  // Add a new method to reset the running state
  async resetState() {
    this.isRunning = false;
    this.apiErrorCount = 0;
    this.lastError = null;
    
    try {
      await Progress.findOneAndUpdate(
        { userId: this.userId },
        { 
          isRunning: false,
          error: null,
          lastError: null,
          apiErrorCount: 0
        },
        { upsert: true }
      );
    } catch (error) {
      console.error("Error resetting state:", error);
    }
  }

  async start(progressCallback, startFresh = false, startFromProductId = null) {
    // First reset any stale state
    await this.resetState();
    
    if (this.isRunning) return;
    
    this.isRunning = true;
    this.onProgress = progressCallback;
    this.processedImages = [];
    this.apiErrorCount = 0; // Reset error count on start
    
    try {
      if (startFresh) {
        // Reset progress in database
        this.processedProductIds.clear();
        await Progress.findOneAndUpdate(
          { userId: this.userId },
          { 
            lastProductId: null,
            currentProductId: null,
            currentProductTitle: null,
            completedProducts: 0,
            totalProducts: 0,
            isRunning: true,
            startedAt: new Date(),
            processedProductIds: []
          },
          { upsert: true }
        );
        console.log('🔄 Starting fresh: Reset progress in database');
      }

      const products = await this.fetchProducts();
      this.totalProducts = products.length;
      let startIndex = 0;

      if (startFromProductId) {
        // Find the index of the specified product ID
        startIndex = products.findIndex((p) => p.id.toString() === startFromProductId.toString());
        if (startIndex === -1) {
          console.warn(`⚠️ Product ID ${startFromProductId} not found, starting from beginning`);
          startIndex = 0;
        } else {
          console.log(`🎯 Starting from product ID ${startFromProductId} at index ${startIndex}`);
          // Update completed products count
          this.completedProducts = startIndex;
        }
      } else if (!startFresh) {
        const progress = await this.loadProgress();
        this.completedProducts = progress.completedProducts || 0;
        
        // Find the current product being processed when stopped
        if (progress.currentProductTitle) {
          startIndex = products.findIndex((p) => p.title === progress.currentProductTitle);
          if (startIndex === -1) {
            if (progress.lastProductId) {
              startIndex = products.findIndex((p) => p.id === progress.lastProductId);
              startIndex = startIndex !== -1 ? startIndex + 1 : 0;
            } else {
              startIndex = 0;
            }
          }
          console.log(`⏳ Resuming from product: ${progress.currentProductTitle} (index: ${startIndex})`);
        } else if (progress.lastProductId) {
          startIndex = products.findIndex((p) => p.id === progress.lastProductId);
          startIndex = startIndex !== -1 ? startIndex + 1 : 0;
          console.log(`⏳ Resuming after last completed product (index: ${startIndex})`);
        }
      }

      // Only process products from startIndex onwards
      const remainingProducts = products.slice(startIndex);
      console.log(`📦 Remaining products to process: ${remainingProducts.length}`);
      
      // Replace products array with remaining products
      products.splice(0, products.length, ...remainingProducts);

      // Update progress in database
      await Progress.findOneAndUpdate(
        { userId: this.userId },
        { 
          totalProducts: this.totalProducts,
          completedProducts: this.completedProducts,
          isRunning: true
        },
        { upsert: true }
      );

      this.updateProgress();

      for (const product of products) {
        if (!this.isRunning) break;
        
        if (!product.images || product.images.length === 0) continue;
        
        this.currentProduct = product.title;
        this.updateProgress();

        for (const image of product.images) {
          if (!this.isRunning) break;
          
          const { src, id, variant_ids } = image;
          this.currentImage = {
            id,
            src,
            productId: product.id,
            productTitle: product.title,
            status: 'processing'
          };
          this.updateProgress();
          
          console.log(`🔍 Processing image ${id} for product ${product.id}...`);

          try {
            // Process the image
            const result = await this.processImage(image, product);
            
            if (!result.success) {
              console.error(`Failed to process image ${id}:`, result.error);
              this.currentImage.status = 'error';
              this.currentImage.error = result.error;
              this.addToProcessedImages(this.currentImage);
              
              // If it's an API key error, stop the process gracefully
              if (result.apiKeyError) {
                this.isRunning = false;
                break;
              }
              continue;
            }

            const { newAltText, newFilename } = result;

            // Create FormData and upload new image
            const imageBuffer = await this.downloadImage(src);
            if (!imageBuffer) {
              throw new Error('Failed to download image');
            }

            const formData = new FormData();
            const imageStream = this.bufferToStream(imageBuffer);
            
            formData.append('image[attachment]', imageStream, {
              filename: `${newFilename}.jpg`,
              contentType: 'image/jpeg'
            });
            formData.append('image[alt]', newAltText);

            // Upload new image
            const uploadResponse = await axios.post(
              `https://${this.shopName}.myshopify.com/admin/api/2024-01/products/${product.id}/images.json`,
              formData,
              {
                headers: {
                  ...formData.getHeaders(),
                  "X-Shopify-Access-Token": this.shopifyKey,
                },
              }
            );

            const newImageId = uploadResponse.data.image.id;
            const newImageUrl = uploadResponse.data.image.src;

            // Handle variant reassignment
            if (variant_ids && variant_ids.length > 0) {
              for (const variantId of variant_ids) {
                await axios.put(
                  `https://${this.shopName}.myshopify.com/admin/api/2024-01/variants/${variantId}.json`,
                  { variant: { id: variantId, image_id: newImageId } },
                  { headers: { "X-Shopify-Access-Token": this.shopifyKey } }
                );
              }
            }

            // Delete old image
            await new Promise(resolve => setTimeout(resolve, 1000));
            try {
              await axios.delete(
                `https://${this.shopName}.myshopify.com/admin/api/2024-01/products/${product.id}/images/${id}.json`,
                { headers: { "X-Shopify-Access-Token": this.shopifyKey } }
              );
            } catch (deleteError) {
              console.warn(`⚠️ Could not delete old image ${id}:`, deleteError.message);
            }
            
            this.currentImage.status = 'completed';
            this.currentImage.newAltText = newAltText;
            this.currentImage.newFilename = newFilename;
            this.currentImage.src = newImageUrl;
            this.currentImage.oldImageId = id;
            this.currentImage.newImageId = newImageId;
            this.addToProcessedImages(this.currentImage);

          } catch (error) {
            console.error(`Error processing image ${id}:`, error.message);
            this.currentImage.status = 'error';
            this.currentImage.error = error.message;
            this.addToProcessedImages(this.currentImage);
            continue;
          }
        }

        if (!this.isRunning) break;

        // Mark product as processed
        this.processedProductIds.add(product.id);
        this.completedProducts++;
        await this.saveProgress(product.id);
        this.updateProgress();
      }
    } catch (error) {
      console.error("❌ Error in SEO process:", error);
      await this.forceStop(error.message);
    } finally {
      // Ensure we always update the final state
      if (this.isRunning) {
        await this.forceStop('Process completed');
      }
    }
  }

  addToProcessedImages(image) {
    this.processedImages.unshift(image);  // Add to the beginning
    if (this.processedImages.length > this.maxProcessedImages) {
      this.processedImages.pop();  // Remove the oldest
    }
    this.updateProgress();
  }

  async updateProgress(update) {
    try {
      const progress = await Progress.findOneAndUpdate(
        { userId: this.userId, shopName: this.shopName },
        {
          $set: {
            ...update,
            lastError: this.lastError ? this.lastError.message : null,
            apiErrorCount: this.apiErrorCount
          }
        },
        { new: true, upsert: true }
      );
      return progress;
    } catch (error) {
      console.error('Error updating progress:', error);
    }
  }
}

module.exports = SEOService; 