import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Alert,
  FlatList,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { useAuth } from '../../contexts/AuthContext';
import { documentService } from '../../services/api';
import { Colors } from '../../constants/Colors';

const DOC_TYPES = [
  { value: 'passport', label: 'Passport', icon: 'document-text-outline' as const },
  { value: 'pancard', label: 'PAN Card', icon: 'card-outline' as const },
  { value: 'aadhar', label: 'Aadhar Card', icon: 'finger-print-outline' as const },
  { value: 'digital_photo', label: 'Digital Photo (35x45mm)', icon: 'camera-outline' as const },
  { value: 'visa', label: 'Visa', icon: 'airplane-outline' as const },
  { value: 'ticket', label: 'Ticket', icon: 'ticket-outline' as const },
  { value: 'id_proof', label: 'ID Proof', icon: 'card-outline' as const },
  { value: 'medical', label: 'Medical', icon: 'medkit-outline' as const },
  { value: 'other', label: 'Other', icon: 'folder-outline' as const },
];

function getDocTypeBadge(type: string) {
  const found = DOC_TYPES.find(d => d.value === type);
  return found || { value: type, label: type, icon: 'document-outline' as const };
}

export default function ProfileScreen() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [documents, setDocuments] = useState<any[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showDocuments, setShowDocuments] = useState(false);

  useEffect(() => {
    if (user && showDocuments) {
      loadDocuments();
    }
  }, [user, showDocuments]);

  const loadDocuments = async () => {
    if (!user) return;
    setLoadingDocs(true);
    try {
      const response = await documentService.getUserDocuments(user.id);
      if (response.success) {
        setDocuments(response.documents || []);
      }
    } catch (error) {
      console.error('Failed to load documents:', error);
    } finally {
      setLoadingDocs(false);
    }
  };

  const handleUploadDocument = async () => {
    if (!user) return;

    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/*'],
        copyToCacheDirectory: true,
      });

      if (result.canceled) return;

      const file = result.assets[0];

      const uploadFile = async (docType: string) => {
        setUploading(true);
        try {
          const response = await documentService.uploadDocument({
            userId: user.id,
            type: docType,
            fileName: file.name,
            fileUri: file.uri,
          });
          if (response.success) {
            Alert.alert('Success', 'Document uploaded successfully');
            loadDocuments();
          } else {
            Alert.alert('Error', response.error || 'Upload failed');
          }
        } catch (error: any) {
          Alert.alert('Error', error.message || 'Upload failed');
        } finally {
          setUploading(false);
        }
      };

      Alert.alert(
        'Select Document Type',
        'What type of document is this?',
        DOC_TYPES.map(dt => ({
          text: dt.value === 'digital_photo'
            ? `${dt.label}\n(35x45mm, 400x514px, JPG <60KB, White BG, Face 70-80%)`
            : dt.label,
          onPress: () => {
            if (dt.value === 'digital_photo') {
              Alert.alert(
                'Digital Photo Requirements',
                '• Dimension: 35mm x 45mm\n• Resolution: 400 x 514 pixels\n• Format: JPG, max 60KB\n• Face size: 70-80% of photo\n• Background: White\n• Borderless\n\nProceed with upload?',
                [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Upload', onPress: () => uploadFile(dt.value) },
                ]
              );
            } else {
              uploadFile(dt.value);
            }
          },
        }))
      );
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Could not pick document');
    }
  };

  const handleLogout = () => {
    Alert.alert(
      'Logout',
      'Are you sure you want to logout?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Logout',
          style: 'destructive',
          onPress: async () => {
            await logout();
            router.replace('/(auth)/login');
          },
        },
      ]
    );
  };

  const renderDocumentItem = (doc: any) => {
    const badge = getDocTypeBadge(doc.type);
    return (
      <View style={styles.docItem}>
        <View style={styles.docIconContainer}>
          <Ionicons name={badge.icon} size={22} color={Colors.primary} />
        </View>
        <View style={styles.docInfo}>
          <Text style={styles.docName} numberOfLines={1}>{doc.fileName}</Text>
          <Text style={styles.docDate}>
            {doc.uploadedAt ? new Date(doc.uploadedAt).toLocaleDateString('en-IN') : '-'}
          </Text>
        </View>
        <View style={styles.docBadge}>
          <Text style={styles.docBadgeText}>{badge.label}</Text>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.avatarContainer}>
          <Text style={styles.avatarText}>
            {user?.name.charAt(0).toUpperCase()}
          </Text>
        </View>
        <Text style={styles.headerTitle}>{user?.name}</Text>
        <Text style={styles.headerSubtitle}>{user?.email}</Text>
      </View>

      <ScrollView style={styles.content}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account Information</Text>

          <View style={styles.infoCard}>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Full Name</Text>
              <Text style={styles.infoValue}>{user?.name}</Text>
            </View>

            <View style={styles.divider} />

            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Email</Text>
              <Text style={styles.infoValue}>{user?.email}</Text>
            </View>

            <View style={styles.divider} />

            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Phone</Text>
              <Text style={styles.infoValue}>{user?.phone}</Text>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Quick Actions</Text>

          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => router.push('/(tabs)/bookings')}
          >
            <View style={styles.actionLeft}>
              <Ionicons name="calendar-outline" size={20} color={Colors.primary} />
              <Text style={styles.actionText}>My Bookings</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={Colors.primary} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => setShowDocuments(!showDocuments)}
          >
            <View style={styles.actionLeft}>
              <Ionicons name="document-text-outline" size={20} color={Colors.primary} />
              <Text style={styles.actionText}>My Documents</Text>
            </View>
            <Ionicons name={showDocuments ? 'chevron-down' : 'chevron-forward'} size={20} color={Colors.primary} />
          </TouchableOpacity>

          {showDocuments && (
            <View style={styles.documentsSection}>
              <TouchableOpacity
                style={styles.uploadButton}
                onPress={handleUploadDocument}
                disabled={uploading}
              >
                {uploading ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <View style={styles.uploadButtonRow}>
                    <Ionicons name="cloud-upload-outline" size={20} color="#FFFFFF" />
                    <Text style={styles.uploadButtonText}>Upload Document</Text>
                  </View>
                )}
              </TouchableOpacity>

              {loadingDocs ? (
                <ActivityIndicator size="small" color={Colors.primary} style={{ marginTop: 16 }} />
              ) : documents.length === 0 ? (
                <View style={styles.emptyDocs}>
                  <Ionicons name="folder-open-outline" size={32} color={Colors.textSecondary} />
                  <Text style={styles.emptyDocsText}>No documents uploaded yet</Text>
                </View>
              ) : (
                documents.map((doc, index) => (
                  <View key={doc.id || index}>{renderDocumentItem(doc)}</View>
                ))
              )}
            </View>
          )}

          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => Alert.alert('Support', 'Contact us at: support@alburhan.com\nPhone: +91 1234567890')}
          >
            <View style={styles.actionLeft}>
              <Ionicons name="call-outline" size={20} color={Colors.primary} />
              <Text style={styles.actionText}>Contact Support</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={Colors.primary} />
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <TouchableOpacity
            style={styles.logoutButton}
            onPress={handleLogout}
          >
            <Text style={styles.logoutButtonText}>Logout</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>AL BURHAN TOURS & TRAVELS</Text>
          <Text style={styles.footerSubtext}>Version 1.0.0</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    backgroundColor: Colors.primary,
    padding: 20,
    paddingBottom: 40,
    alignItems: 'center',
  },
  avatarContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.secondary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  avatarText: {
    fontSize: 32,
    fontWeight: 'bold' as const,
    color: '#FFFFFF',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold' as const,
    color: '#FFFFFF',
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.8)',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold' as const,
    color: Colors.text,
    marginBottom: 12,
  },
  infoCard: {
    backgroundColor: Colors.card,
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
  },
  infoLabel: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  infoValue: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.text,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.border,
  },
  actionCard: {
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  actionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  actionText: {
    fontSize: 16,
    color: Colors.text,
    fontWeight: '500' as const,
  },
  documentsSection: {
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  uploadButton: {
    backgroundColor: Colors.primary,
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
  },
  uploadButtonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  uploadButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600' as const,
  },
  emptyDocs: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  emptyDocsText: {
    color: Colors.textSecondary,
    fontSize: 14,
    marginTop: 8,
  },
  docItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    marginTop: 8,
  },
  docIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#ECFDF5',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  docInfo: {
    flex: 1,
  },
  docName: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.text,
  },
  docDate: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  docBadge: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  docBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '600' as const,
  },
  logoutButton: {
    backgroundColor: Colors.error,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  logoutButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold' as const,
  },
  footer: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  footerText: {
    fontSize: 12,
    color: Colors.textSecondary,
    fontWeight: '600' as const,
  },
  footerSubtext: {
    fontSize: 10,
    color: Colors.textSecondary,
    marginTop: 4,
  },
});
