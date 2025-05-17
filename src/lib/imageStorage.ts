import { storage } from './firebase';
import { ref, uploadString, getDownloadURL, deleteObject } from 'firebase/storage';
import { v4 as uuidv4 } from 'uuid'; // Make sure to install this: npm install uuid

// Debug flag to enable detailed logging
const DEBUG = true;

/**
 * Stores a base64 image in Firebase Storage and returns the storage reference path
 * 
 * @param base64String - The base64 string of the image
 * @param userId - The user ID to organize storage (optional)
 * @param contentType - The content type of the image (default: 'image/jpeg')
 * @returns The storage reference path to the image
 */
export async function storeImageToFirebase(
  base64String: string,
  userId?: string | null,
  contentType: string = 'image/jpeg'
): Promise<string> {
  try {
    if (DEBUG) console.log('Firebase Storage config:', storage.app.options);
    
    // Validate inputs
    if (!base64String || base64String.length < 10) {
      throw new Error('Invalid base64 string provided');
    }
    
    // Create a unique ID for the image
    const imageId = uuidv4();
    
    // Create a proper folder structure
    const folderPath = userId ? `users/${userId}/images` : 'guest/images';
    
    // Final path for the image in storage
    const imagePath = `${folderPath}/${imageId}`;
    
    if (DEBUG) console.log(`Storing image to path: ${imagePath}`);
    
    // Get a reference to the location where we'll store the image
    const storageRef = ref(storage, imagePath);

    // Extract the actual base64 data from a data URL if needed
    let base64Data = base64String;
    if (base64String.includes('base64,')) {
      base64Data = base64String.split('base64,')[1];
      if (DEBUG) console.log('Extracted base64 data from data URL');
    }

    // Upload the data
    if (DEBUG) console.log(`Starting upload of ${base64Data.length} characters`);
    await uploadString(storageRef, base64Data, 'base64', { contentType });
    if (DEBUG) console.log('Upload completed successfully');
    
    // Return the storage path to store in Firestore
    return imagePath;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`Error storing image to Firebase Storage: ${errorMessage}`, error);
    throw error;
  }
}

/**
 * Retrieves a download URL for a stored image
 * 
 * @param storagePath - The storage reference path to the image
 * @returns The public download URL for the image
 */
export async function getImageFromStorage(storagePath: string): Promise<string> {
  try {
    if (DEBUG) console.log(`Getting image from path: ${storagePath}`);
    
    const storageRef = ref(storage, storagePath);
    const downloadURL = await getDownloadURL(storageRef);
    
    if (DEBUG) console.log(`Successfully retrieved URL: ${downloadURL.substring(0, 50)}...`);
    return downloadURL;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`Error retrieving image from Firebase Storage (path: ${storagePath}): ${errorMessage}`, error);
    throw error;
  }
}

/**
 * Deletes an image from Firebase Storage
 * 
 * @param storagePath - The storage reference path to the image
 */
export async function deleteImageFromStorage(storagePath: string): Promise<void> {
  try {
    if (DEBUG) console.log(`Deleting image from path: ${storagePath}`);
    
    const storageRef = ref(storage, storagePath);
    await deleteObject(storageRef);
    
    if (DEBUG) console.log('Image deleted successfully');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`Error deleting image from Firebase Storage (path: ${storagePath}): ${errorMessage}`, error);
    throw error;
  }
} 