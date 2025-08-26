// app/(tabs)/explore.tsx
import React from 'react';
import { StyleSheet, View, Text, ScrollView, TouchableOpacity, Alert } from 'react-native';
import * as FileSystem from 'expo-file-system';
import { StatusBar } from 'expo-status-bar';

export default function SettingsScreen() {
  const checkStorageUsage = async () => {
    try {
      const mbtilesPath = `${FileSystem.documentDirectory}kolkata_10km.mbtiles`;
      const dbPath = `${FileSystem.documentDirectory}kolkata_map.db`;
      
      let totalSize = 0;
      let fileDetails = '';

      const mbtilesInfo = await FileSystem.getInfoAsync(mbtilesPath);
      if (mbtilesInfo.exists) {
        totalSize += mbtilesInfo.size;
        fileDetails += `MBTiles: ${(mbtilesInfo.size / 1024 / 1024).toFixed(2)} MB\n`;
      }

      const dbInfo = await FileSystem.getInfoAsync(dbPath);
      if (dbInfo.exists) {
        totalSize += dbInfo.size;
        fileDetails += `Database: ${(dbInfo.size / 1024 / 1024).toFixed(2)} MB\n`;
      }

      if (totalSize === 0) {
        Alert.alert('Storage Usage', 'No offline maps are currently stored.');
      } else {
        Alert.alert(
          'Storage Usage', 
          `Total storage used: ${(totalSize / 1024 / 1024).toFixed(2)} MB\n\n${fileDetails}`
        );
      }
    } catch (error) {
      Alert.alert('Error', 'Could not check storage usage');
    }
  };

  const clearCache = async () => {
    Alert.alert(
      'Clear Cache',
      'This will remove temporary files but keep your offline maps. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          onPress: async () => {
            try {
              // Clear any temporary files
              const tempFiles = await FileSystem.readDirectoryAsync(FileSystem.documentDirectory || '');
              const filesToDelete = tempFiles.filter(file => 
                file.endsWith('.zip') || 
                file.endsWith('.tmp') ||
                file.includes('temp')
              );
              
              for (const file of filesToDelete) {
                await FileSystem.deleteAsync(`${FileSystem.documentDirectory}${file}`, { idempotent: true });
              }
              
              Alert.alert('Success', 'Cache cleared successfully');
            } catch (error) {
              Alert.alert('Error', 'Could not clear cache');
            }
          }
        }
      ]
    );
  };

  return (
    <ScrollView style={styles.container}>
      <StatusBar style="auto" />
      
      <View style={styles.header}>
        <Text style={styles.title}>Settings</Text>
        <Text style={styles.subtitle}>Manage your offline maps and app settings</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Storage Management</Text>
        
        <TouchableOpacity style={styles.settingItem} onPress={checkStorageUsage}>
          <Text style={styles.settingLabel}>📊 Check Storage Usage</Text>
          <Text style={styles.settingDescription}>View how much space offline maps are using</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.settingItem} onPress={clearCache}>
          <Text style={styles.settingLabel}>🧹 Clear Cache</Text>
          <Text style={styles.settingDescription}>Remove temporary files and free up space</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>About Offline Maps</Text>
        
        <View style={styles.infoItem}>
          <Text style={styles.infoLabel}>📍 Coverage Area</Text>
          <Text style={styles.infoDescription}>
            Kolkata metropolitan area with 10km radius from city center
          </Text>
        </View>

        <View style={styles.infoItem}>
          <Text style={styles.infoLabel}>🗺 Map Data</Text>
          <Text style={styles.infoDescription}>
            High-quality offline map tiles for navigation without internet
          </Text>
        </View>

        <View style={styles.infoItem}>
          <Text style={styles.infoLabel}>💰 Cost</Text>
          <Text style={styles.infoDescription}>
            Completely free - no API keys or subscriptions required
          </Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>App Information</Text>
        
        <View style={styles.infoItem}>
          <Text style={styles.infoLabel}>📱 Version</Text>
          <Text style={styles.infoDescription}>1.0.0</Text>
        </View>

        <View style={styles.infoItem}>
          <Text style={styles.infoLabel}>🛠 Technology</Text>
          <Text style={styles.infoDescription}>
            React Native • Expo • MBTiles • SQLite
          </Text>
        </View>
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>
          This app uses OpenStreetMap data and provides offline mapping capabilities for the Kolkata area.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    backgroundColor: '#fff',
    padding: 20,
    paddingTop: 60,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
  },
  section: {
    backgroundColor: '#fff',
    marginTop: 20,
    paddingVertical: 10,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    paddingHorizontal: 20,
    paddingVertical: 15,
    backgroundColor: '#f8f9fa',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  settingItem: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  settingLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
    marginBottom: 4,
  },
  settingDescription: {
    fontSize: 14,
    color: '#666',
  },
  infoItem: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  infoLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
    marginBottom: 4,
  },
  infoDescription: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
  footer: {
    padding: 20,
    marginTop: 20,
    marginBottom: 40,
  },
  footerText: {
    fontSize: 12,
    color: '#999',
    textAlign: 'center',
    lineHeight: 18,
  },
});