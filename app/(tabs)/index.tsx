// app/(tabs)/index.tsx
import React, { useState, useEffect, useRef } from 'react';
import { 
  StyleSheet, 
  View, 
  Text, 
  Alert, 
  TouchableOpacity, 
  ActivityIndicator,
  Platform,
  Dimensions
} from 'react-native';
import MapView, { PROVIDER_DEFAULT } from 'react-native-maps';
import * as Location from 'expo-location';
import * as FileSystem from 'expo-file-system';
import * as SQLite from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';

// Your GitHub release URL
const GITHUB_RELEASE_URL = 'https://github.com/user-attachments/files/21995160/kolkata_10km.zip';
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

export default function MapScreen() {
  const [location, setLocation] = useState<LocationState | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [offlineMapAvailable, setOfflineMapAvailable] = useState(false);
  const [db, setDb] = useState<SQLite.SQLiteDatabase | null>(null);
  const [locationPermission, setLocationPermission] = useState<string>('undetermined');
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
      
      if (fileInfo.exists && fileInfo.size > 0) {
        setOfflineMapAvailable(true);
        await initializeDatabase();
      }
    } catch (error) {
      console.error('Error checking offline map:', error);
    }
  };

  const initializeDatabase = async () => {
    try {
      const mbtilesPath = `${FileSystem.documentDirectory}kolkata_10km.mbtiles`;
      const dbPath = `${FileSystem.documentDirectory}${MAP_DATABASE_NAME}`;
      
      // Copy MBTiles to SQLite database
      const dbExists = await FileSystem.getInfoAsync(dbPath);
      if (!dbExists.exists) {
        await FileSystem.copyAsync({
          from: mbtilesPath,
          to: dbPath
        });
      }

      const database = await SQLite.openDatabaseAsync(MAP_DATABASE_NAME);
      setDb(database);
      
      // Test database
      const result = await database.getFirstAsync('SELECT COUNT(*) as count FROM tiles');
      // console.log(`Database initialized with ${result?.count || 0} tiles`);
      
    } catch (error) {
      console.error('Error initializing database:', error);
    }
  };

  const isLocationInBounds = (lat: number, lng: number): boolean => {
    return (
      lat >= KOLKATA_BOUNDS.minLat && lat <= KOLKATA_BOUNDS.maxLat &&
      lng >= KOLKATA_BOUNDS.minLng && lng <= KOLKATA_BOUNDS.maxLng
    );
  };

  const downloadOfflineMap = async () => {
    if (downloading) return;

    let shouldDownload = true;
    
    if (location && !isLocationInBounds(location.latitude, location.longitude)) {
      Alert.alert(
        'Location Notice', 
        'This offline map is optimized for Kolkata area (10km radius). Your current location appears to be outside this area. Download anyway?',
        [
          { text: 'Cancel', style: 'cancel', onPress: () => { shouldDownload = false; } },
          { text: 'Download', onPress: () => { shouldDownload = true; } }
        ]
      );
      return;
    }

    if (shouldDownload) {
      await startDownload();
    }
  };

  const startDownload = async () => {
    setDownloading(true);
    setDownloadProgress(0);

    try {
      const zipPath = `${FileSystem.documentDirectory}kolkata_map.zip`;
      
      // Remove existing file if it exists
      const existingFile = await FileSystem.getInfoAsync(zipPath);
      if (existingFile.exists) {
        await FileSystem.deleteAsync(zipPath);
      }

      console.log('Starting download from:', GITHUB_RELEASE_URL);
      
      const downloadResumable = FileSystem.createDownloadResumable(
        GITHUB_RELEASE_URL,
        zipPath,
        {},
        (downloadProgress) => {
          const progress = downloadProgress.totalBytesWritten / downloadProgress.totalBytesExpectedToWrite;
          setDownloadProgress(progress);
          console.log(`Download progress: ${Math.round(progress * 100)}%`);
        }
      );

      const result = await downloadResumable.downloadAsync();
      
      if (result?.uri) {
        console.log('Download completed, processing...');
        await processDownloadedFile(result.uri);
      } else {
        throw new Error('Download failed - no file received');
      }
    } catch (error:any) {
      console.error('Download failed:', error);
      Alert.alert('Download Failed', `Failed to download offline map: ${error.message}\n\nPlease check your internet connection and try again.`);
    } finally {
      setDownloading(false);
    }
  };

  const processDownloadedFile = async (filePath: string) => {
    try {
      const mbtilesPath = `${FileSystem.documentDirectory}kolkata_10km.mbtiles`;
      
      // Check file size
      const fileInfo = await FileSystem.getInfoAsync(filePath);
      // console.log(`Downloaded file size: ${fileInfo.size} bytes`);
      
      // if (fileInfo.size === 0) {
      //   throw new Error('Downloaded file is empty');
      // }

      // For now, assume the downloaded file is already in MBTiles format
      // In production, you might need proper ZIP extraction
      await FileSystem.moveAsync({
        from: filePath,
        to: mbtilesPath
      });

      // Verify the moved file
      const verifyInfo = await FileSystem.getInfoAsync(mbtilesPath);
      if (!verifyInfo.exists || verifyInfo.size === 0) {
        throw new Error('Failed to save map file');
      }

      console.log('File processed successfully');
      await checkOfflineMapAvailability();
      
      Alert.alert(
        'Success!', 
        'Offline map downloaded successfully! You can now use maps even without internet connection.',
        [
          { 
            text: 'OK', 
            onPress: () => {
              if (location && isLocationInBounds(location.latitude, location.longitude)) {
                mapRef.current?.animateToRegion({
                  ...location,
                  latitudeDelta: 0.02,
                  longitudeDelta: 0.02,
                }, 1000);
              }
            }
          }
        ]
      );
      
    } catch (error:any) {
      console.error('Processing failed:', error);
      Alert.alert('Error', `Failed to process downloaded map: ${error.message}`);
    }
  };

  const deleteOfflineMap = () => {
    Alert.alert(
      'Confirm Delete',
      'Are you sure you want to delete the offline map? This will free up storage space but you\'ll need internet to view maps.',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Delete', 
          style: 'destructive',
          onPress: async () => {
            try {
              const mbtilesPath = `${FileSystem.documentDirectory}kolkata_10km.mbtiles`;
              const dbPath = `${FileSystem.documentDirectory}${MAP_DATABASE_NAME}`;
              
              await FileSystem.deleteAsync(mbtilesPath, { idempotent: true });
              await FileSystem.deleteAsync(dbPath, { idempotent: true });
              
              setOfflineMapAvailable(false);
              setDb(null);
              
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
    const kolkataRegion = {
      latitude: KOLKATA_BOUNDS.center.latitude,
      longitude: KOLKATA_BOUNDS.center.longitude,
      latitudeDelta: 0.05,
      longitudeDelta: 0.05,
    };
    
    mapRef.current?.animateToRegion(kolkataRegion, 1000);
  };

  if (!location) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Loading map...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar style="auto" />
      
      <MapView
        ref={mapRef}
        provider={PROVIDER_DEFAULT} // Use default provider (free)
        style={styles.map}
        initialRegion={location}
        showsUserLocation={locationPermission === 'granted'}
        showsMyLocationButton={locationPermission === 'granted'}
        onMapReady={() => setMapReady(true)}
        mapType="standard"
      />
      
      <View style={styles.controls}>
        <View style={styles.statusContainer}>
          <Text style={styles.statusText}>
            {offlineMapAvailable 
              ? '✅ Offline map available' 
              : '📍 Online map only'
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
                  : '⬇ Download Kolkata Map (Offline)'
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
  },
  loadingText: {
    marginTop: 20,
    fontSize: 16,
    color: '#666',
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