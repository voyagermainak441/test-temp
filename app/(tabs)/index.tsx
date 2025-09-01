// app/(tabs)/index.tsx
import * as FileSystem from 'expo-file-system';
import * as Location from 'expo-location';
import * as SQLite from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Dimensions,
  Image
} from 'react-native';
import MapView, { Marker, } from 'react-native-maps';

// Your GitHub release URL - Make sure this points to your MBTiles file
const GITHUB_RELEASE_URL = "https://drive.google.com/uc?export=download&id=1KghfVnf3KPPnvpOtqJCNXnHdGZC9BNj1&confirm=t";


const MAP_DATABASE_NAME = 'kolkata_map.db';

// Kolkata bounds for the 10km radius map
const KOLKATA_BOUNDS = {
  minLat: 22.479910,
  maxLat: 22.660090,
  minLng: 88.262718,
  maxLng: 88.457282,
  center: {
    latitude: 22.57,
    longitude: 88.36,
  }
};

interface LocationState {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
}

interface TileData {
  zoom_level: number;
  tile_column: number;
  tile_row: number;
  tile_data: string;
}

interface FileInfo {
  exists: boolean;
  uri: string;
  isDirectory: boolean;
  size?: number;
  modificationTime?: number;
}

interface DatabaseTable {
  name: string;
}

interface TileCountResult {
  count: number;
}

interface MetadataEntry {
  name: string;
  value: string;
}


export default function MapScreen() {
  const [location, setLocation] = useState<LocationState | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [offlineMapAvailable, setOfflineMapAvailable] = useState(false);
  const [db, setDb] = useState<SQLite.SQLiteDatabase | null>(null);
  const [locationPermission, setLocationPermission] = useState<string>('undetermined');
  const [mapError, setMapError] = useState<string | null>(null);
  const mapRef = useRef<MapView>(null);

  useEffect(() => {
    initializeApp();
  }, []);

  const initializeApp = async () => {
    try {
      // Request location permissions
      const { status } = await Location.requestForegroundPermissionsAsync();
      setLocationPermission(status);

      if (status === 'granted') {
        await getCurrentLocation();
      } else {
        // Use Kolkata as default location
        setLocation({
          latitude: KOLKATA_BOUNDS.center.latitude,
          longitude: KOLKATA_BOUNDS.center.longitude,
          latitudeDelta: 0.05,
          longitudeDelta: 0.05,
        });
      }

      // Check if offline map exists
      await checkOfflineMapAvailability();
    } catch (error) {
      console.error('Error initializing app:', error);
      setMapError('Failed to initialize app');
      // Fallback to Kolkata center
      setLocation({
        latitude: KOLKATA_BOUNDS.center.latitude,
        longitude: KOLKATA_BOUNDS.center.longitude,
        latitudeDelta: 0.05,
        longitudeDelta: 0.05,
      });
    }
  };

  const getCurrentLocation = async () => {
    try {
      const currentLocation = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
        timeInterval: 10000,
      });

      setLocation({
        latitude: currentLocation.coords.latitude,
        longitude: currentLocation.coords.longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      });
    } catch (error) {
      console.error('Error getting location:', error);
      setLocation({
        latitude: KOLKATA_BOUNDS.center.latitude,
        longitude: KOLKATA_BOUNDS.center.longitude,
        latitudeDelta: 0.05,
        longitudeDelta: 0.05,
      });
    }
  };

  const checkOfflineMapAvailability = async () => {
    try {
      const mbtilesPath = `${FileSystem.documentDirectory}kolkata_10km.mbtiles`;
      const fileInfo = await FileSystem.getInfoAsync(mbtilesPath);

      if (fileInfo.exists && fileInfo.size && fileInfo.size > 0) {
        setOfflineMapAvailable(true);
        await initializeDatabase();
      } else {
        setOfflineMapAvailable(false);
      }
    } catch (error) {
      console.error('Error checking offline map:', error);
      setOfflineMapAvailable(false);
    }
  };

  const initializeDatabase = async () => {
    try {
      const mbtilesPath = `${FileSystem.documentDirectory}kolkata_10km.mbtiles`;
      const fileInfo = await FileSystem.getInfoAsync(mbtilesPath);

      if (!fileInfo.exists) {
        console.log('MBTiles file does not exist at:', mbtilesPath);
        setOfflineMapAvailable(false);
        return;
      }

      const database = await SQLite.openDatabaseAsync(mbtilesPath);
      if (!database) {
        throw new Error('Failed to open database');
      }
      setDb(database);

      // Query tables
      const tables = await database.getAllAsync<DatabaseTable>(
        "SELECT name FROM sqlite_master WHERE type='table'"
      );

      const tilesTable = tables.find(table => table.name === 'tiles' || table.name === 'tile');
      if (tilesTable) {
        const result = await database.getFirstAsync<TileCountResult>(
          `SELECT COUNT(*) as count FROM ${tilesTable.name}`
        );
        console.log(`MBTiles database loaded with ${result?.count || 0} tiles`);
      }

      const metadataTable = tables.find(table => table.name === 'metadata');
      if (metadataTable) {
        const metadata = await database.getAllAsync<MetadataEntry>('SELECT name, value FROM metadata');
        console.log('MBTiles metadata:', metadata);
      }

    } catch (error) {
      console.error('Error initializing MBTiles database:', error);
      setOfflineMapAvailable(false);
      setDb(null);
    }
  };


  const isLocationInBounds = (lat: number, lng: number): boolean => {
    return (
      lat >= KOLKATA_BOUNDS.minLat && lat <= KOLKATA_BOUNDS.maxLat &&
      lng >= KOLKATA_BOUNDS.minLng && lng <= KOLKATA_BOUNDS.maxLng
    );
  };

  // Custom tile URL template for offline tiles
  const getOfflineTileUrl = (x: number, y: number, z: number): string => {
    // This would need to be implemented with a local tile server
    // For now, return a placeholder
    return `file://${FileSystem.documentDirectory}tiles/${z}/${x}/${y}.png`;
  };

  const downloadOfflineMap = async () => {
    if (downloading) return;

    // Show confirmation dialog
    Alert.alert(
      'Download Offline Map',
      'This will download the Kolkata offline map (~50-100MB). Make sure you have a good internet connection.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Download', onPress: () => startDownload() }
      ]
    );
  };

  const extractDirectDownloadLink = (html: string): string | null => {
    // Google Drive's confirmation page contains a link with `uc?export=download&confirm=XXX`
    const match = html.match(/uc\?export=download&confirm=([^"]+)/);
    return match ? `https://drive.google.com/${match[0]}` : null;
  };


  const startDownload = async () => {
    setDownloading(true);
    setDownloadProgress(0);

    try {
      const tempDownloadPath = `${FileSystem.documentDirectory}kolkata_10km_download.mbtiles`;

      // Remove existing file if it exists
      const existingTempFile = await FileSystem.getInfoAsync(tempDownloadPath);
      if (existingTempFile.exists) {
        await FileSystem.deleteAsync(tempDownloadPath);
      }

      // First download attempt
      const downloadResumable = FileSystem.createDownloadResumable(
        GITHUB_RELEASE_URL,
        tempDownloadPath,
        {},
        (downloadProgress) => {
          const progress = downloadProgress.totalBytesWritten / downloadProgress.totalBytesExpectedToWrite;
          setDownloadProgress(Math.min(progress, 0.9));
        }
      );

      const result = await downloadResumable.downloadAsync();
      if (!result?.uri) {
        throw new Error("Download failed - no file received");
      }

      // Check if the downloaded file is an HTML page
      const firstBytes = await FileSystem.readAsStringAsync(result.uri, {
        encoding: FileSystem.EncodingType.UTF8,
        length: 100,
      });

      if (firstBytes.includes("<!DOCTYPE html>")) {
        // Extract the direct download link from the HTML
        const html = await FileSystem.readAsStringAsync(result.uri, {
          encoding: FileSystem.EncodingType.UTF8,
        });
        const directDownloadLink = extractDirectDownloadLink(html);

        if (!directDownloadLink) {
          throw new Error("Failed to extract direct download link from Google Drive.");
        }

        // Retry the download with the direct link
        const retryDownloadResumable = FileSystem.createDownloadResumable(
          directDownloadLink,
          tempDownloadPath,
          {},
          (downloadProgress) => {
            const progress = downloadProgress.totalBytesWritten / downloadProgress.totalBytesExpectedToWrite;
            setDownloadProgress(Math.min(progress, 0.9));
          }
        );

        const retryResult = await retryDownloadResumable.downloadAsync();
        if (!retryResult?.uri) {
          throw new Error("Retry download failed - no file received");
        }

        // Process the downloaded file
        await processDownloadedFile(retryResult.uri);
      } else {
        // Process the downloaded file
        await processDownloadedFile(result.uri);
      }
    } catch (error: unknown) {
      console.error("Download failed:", error);
      let errorMessage = "Failed to download offline map.";
      if (error instanceof Error) {
        if (error.message.includes("Network")) {
          errorMessage += " Please check your internet connection.";
        } else if (error.message.includes("404")) {
          errorMessage += " The map file was not found.";
        } else if (error.message.includes("HTML")) {
          errorMessage += " Google Drive returned an HTML page instead of the file.";
        } else {
          errorMessage += ` ${error.message}`;
        }
      }
      Alert.alert("Download Failed", errorMessage);
    } finally {
      setDownloading(false);
      setDownloadProgress(0);
    }
  };


  const isValidSQLiteDatabase = async (filePath: string): Promise<boolean> => {
    try {
      // SQLite databases start with the string "SQLite format 3\0"
      const header = await FileSystem.readAsStringAsync(filePath, {
        encoding: FileSystem.EncodingType.Base64,
        length: 16,
      });
      // The first 16 bytes of a valid SQLite file should match the SQLite header
      return header.startsWith("U1RGRnRt"); // Base64 for "SQLite format 3\0"
    } catch (error) {
      console.error("Error checking SQLite header:", error);
      return false;
    }
  };


  const processDownloadedFile = async (filePath: string) => {
    try {
      const fileInfo = await FileSystem.getInfoAsync(filePath);
      if (!fileInfo.exists || !fileInfo.size || fileInfo.size === 0) {
        throw new Error("Downloaded file is empty or invalid.");
      }

      // Check if the file is a valid SQLite database
      const isValid = await isValidSQLiteDatabase(filePath);
      if (!isValid) {
        throw new Error("Downloaded file is not a valid SQLite database (MBTiles file).");
      }

      const mbtilesPath = `${FileSystem.documentDirectory}kolkata_10km.mbtiles`;

      // Remove existing file if it exists
      const existingFile = await FileSystem.getInfoAsync(mbtilesPath);
      if (existingFile.exists) {
        await FileSystem.deleteAsync(mbtilesPath);
      }

      // Move the file
      await FileSystem.moveAsync({
        from: filePath,
        to: mbtilesPath,
      });

      // Verify the moved file
      const verifyInfo = await FileSystem.getInfoAsync(mbtilesPath);
      if (!verifyInfo.exists || verifyInfo.size === 0) {
        throw new Error("Failed to save MBTiles file.");
      }

      console.log(`MBTiles file saved successfully: ${verifyInfo.size} bytes`);
      setDownloadProgress(1.0);

      // Initialize the database
      await checkOfflineMapAvailability();

      if (offlineMapAvailable) {
        Alert.alert(
          "Success!",
          "Offline map downloaded and installed successfully!",
          [{ text: "OK", onPress: () => goToKolkata() }]
        );
      } else {
        throw new Error("Downloaded file appears to be invalid or corrupted.");
      }
    } catch (error: unknown) {
      console.error("Processing failed:", error);
      let errorMessage = "Failed to process the downloaded map.";
      if (error instanceof Error) {
        if (error.message.includes("empty")) {
          errorMessage += "\nThe downloaded file is empty.";
        } else if (error.message.includes("valid SQLite")) {
          errorMessage += "\nThe downloaded file is not a valid MBTiles file.";
        } else if (error.message.includes("corrupted")) {
          errorMessage += "\nThe downloaded file is corrupted.";
        }
      }
      Alert.alert("Processing Failed", errorMessage);

      // Clean up
      try {
        const mbtilesPath = `${FileSystem.documentDirectory}kolkata_10km.mbtiles`;
        const badFile = await FileSystem.getInfoAsync(mbtilesPath);
        if (badFile.exists) {
          await FileSystem.deleteAsync(mbtilesPath);
        }
      } catch (cleanupError) {
        console.error("Cleanup failed:", cleanupError);
      }
    }
  };


  const deleteOfflineMap = () => {
    Alert.alert(
      'Confirm Delete',
      'Are you sure you want to delete the offline map? This will free up storage space but you\'ll need internet to view detailed maps.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const mbtilesPath = `${FileSystem.documentDirectory}kolkata_10km.mbtiles`;

              // Close database connection first
              if (db) {
                await db.closeAsync();
                setDb(null);
              }

              // Delete the file
              const fileInfo = await FileSystem.getInfoAsync(mbtilesPath);
              if (fileInfo.exists) {
                await FileSystem.deleteAsync(mbtilesPath);
                console.log('MBTiles file deleted');
              }

              setOfflineMapAvailable(false);

              Alert.alert('Success', 'Offline map deleted successfully');
            } catch (error) {
              console.error('Error deleting offline map:', error);
              Alert.alert('Error', 'Failed to delete offline map');
            }
          }
        }
      ]
    );
  };

  const goToKolkata = () => {
    console.log("Navigating to Kolkata...");

    if (!mapRef.current) {
      console.log("Map ref not available");
      return;
    }

    const kolkataRegion = {
      latitude: KOLKATA_BOUNDS.center.latitude,
      longitude: KOLKATA_BOUNDS.center.longitude,
      latitudeDelta: 0.05,
      longitudeDelta: 0.05,
    };

    console.log("Animating to region:", kolkataRegion);

    // Update location state first
    setLocation(kolkataRegion);

    // Then animate the map
    setTimeout(() => {
      mapRef.current?.animateToRegion(kolkataRegion, 1000);
    }, 100);
  };

  if (!location) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>
          {mapError ? `Error: ${mapError}` : 'Loading map...'}
        </Text>
        {mapError && (
          <TouchableOpacity
            style={styles.retryButton}
            onPress={initializeApp}
          >
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar style="auto" />

      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={location}
        region={location}
        showsUserLocation={locationPermission === 'granted'}
        showsMyLocationButton={locationPermission === 'granted'}
        onMapReady={() => {
          console.log("Map is ready");
          setMapReady(true);
        }}
        mapType="standard"
        showsBuildings={false}
        showsTraffic={false}
        showsIndoors={false}
        rotateEnabled={true}
        scrollEnabled={true}
        zoomEnabled={true}
        loadingEnabled={true}
        loadingIndicatorColor="#007AFF"
        loadingBackgroundColor="#ffffff"

      >
        {/* Add a marker for Kolkata center */}
        <Marker
          coordinate={KOLKATA_BOUNDS.center}
          title="Kolkata"
          description="City Center"
          pinColor="red"
        />
      </MapView>

      <View style={styles.controls}>
        <View style={styles.statusContainer}>
          <Text style={styles.statusText}>
            {offlineMapAvailable
              ? '✅ Offline map available'
              : '📍 Basic map only'
            }
          </Text>
          {location && (
            <Text style={styles.locationText}>
              {isLocationInBounds(location.latitude, location.longitude)
                ? '🎯 You are in Kolkata area'
                : '🌍 Outside Kolkata coverage'
              }
            </Text>
          )}
          {mapReady && (
            <Text style={styles.infoText}>
              {offlineMapAvailable
                ? 'Detailed offline maps loaded'
                : 'Download offline map for detailed view'
              }
            </Text>
          )}
        </View>

        <View style={styles.buttonContainer}>
          {!offlineMapAvailable ? (
            <TouchableOpacity
              style={[styles.button, styles.downloadButton, downloading && styles.buttonDisabled]}
              onPress={downloadOfflineMap}
              disabled={downloading}
            >
              <Text style={styles.buttonText}>
                {downloading
                  ? `⬇ Downloading... ${Math.round(downloadProgress * 100)}%`
                  : '⬇ Download Offline Map'
                }
              </Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.button, styles.deleteButton]}
              onPress={deleteOfflineMap}
            >
              <Text style={styles.buttonText}>
                🗑 Delete Offline Map
              </Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={[styles.button, styles.navigationButton]}
            onPress={goToKolkata}
          >
            <Text style={styles.buttonText}>
              🎯 Go to Kolkata
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {downloading && (
        <View style={styles.progressOverlay}>
          <View style={styles.progressContainer}>
            <Text style={styles.progressTitle}>Downloading Offline Map</Text>
            <Text style={styles.progressSubtitle}>
              {downloadProgress < 0.9 ? 'Downloading...' : 'Processing...'}
            </Text>
            <View style={styles.progressBar}>
              <View
                style={[
                  styles.progressFill,
                  { width: `${Math.round(downloadProgress * 100)}%` }
                ]}
              />
            </View>
            <Text style={styles.progressText}>
              {Math.round(downloadProgress * 100)}% complete
            </Text>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 20,
  },
  loadingText: {
    marginTop: 20,
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 20,
    backgroundColor: '#007AFF',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  map: {
    flex: 1,
  },
  controls: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 50 : 30,
    left: 20,
    right: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 15,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 8,
  },
  statusContainer: {
    marginBottom: 15,
  },
  statusText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 5,
  },
  locationText: {
    fontSize: 14,
    color: '#666',
    marginBottom: 3,
  },
  infoText: {
    fontSize: 12,
    color: '#888',
    fontStyle: 'italic',
  },
  buttonContainer: {
    gap: 10,
  },
  button: {
    padding: 15,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  downloadButton: {
    backgroundColor: '#007AFF',
  },
  deleteButton: {
    backgroundColor: '#FF3B30',
  },
  navigationButton: {
    backgroundColor: '#34C759',
  },
  buttonDisabled: {
    backgroundColor: '#cccccc',
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  progressOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  progressContainer: {
    backgroundColor: 'white',
    padding: 30,
    borderRadius: 15,
    width: '80%',
    alignItems: 'center',
  },
  progressTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 10,
    textAlign: 'center',
  },
  progressSubtitle: {
    fontSize: 14,
    color: '#666',
    marginBottom: 20,
    textAlign: 'center',
  },
  progressBar: {
    width: '100%',
    height: 8,
    backgroundColor: '#e0e0e0',
    borderRadius: 4,
    marginBottom: 15,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#007AFF',
    borderRadius: 4,
  },
  progressText: {
    fontSize: 16,
    color: '#666',
  },
});