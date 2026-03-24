import { Feather } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import React, { useCallback, useState } from "react";
import {
  ActionSheetIOS,
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { COLORS } from "@/constants/colors";
import { useAuth } from "@/contexts/auth";
import { useListBookings, useListDocuments, useDeleteDocument, BookingListResponse } from "@workspace/api-client-react";

const MANDATORY_DOCS = [
  { value: "passport_photo", label: "Passport Size Photo", icon: "image" as const, imageOnly: true },
  { value: "passport", label: "Passport Copy", icon: "book-open" as const, imageOnly: false },
  { value: "pan_card", label: "PAN Card", icon: "credit-card" as const, imageOnly: false },
  { value: "aadhaar", label: "Aadhaar Card", icon: "user" as const, imageOnly: false },
  { value: "medical_certificate", label: "Medical Certificate", icon: "activity" as const, imageOnly: false },
];

const TRAVEL_DOC_TYPES: Record<string, { label: string; icon: string; color: string; bg: string }> = {
  flight_ticket: { label: "Flight Ticket", icon: "send", color: "#0369A1", bg: "#E0F2FE" },
  visa: { label: "Visa", icon: "bookmark", color: "#15803D", bg: "#DCFCE7" },
  room_allotment: { label: "Hotel / Room Allotment", icon: "home", color: "#7C3AED", bg: "#EDE9FE" },
  bus_allotment: { label: "Bus Allotment", icon: "truck", color: "#C2410C", bg: "#FFEDD5" },
  model_contract: { label: "Model Contract", icon: "file-text", color: "#BE185D", bg: "#FCE7F3" },
};

const DOC_TYPES = [
  { value: "passport", label: "Passport" },
  { value: "aadhaar", label: "Aadhaar Card" },
  { value: "pan_card", label: "PAN Card" },
  { value: "medical_certificate", label: "Medical Certificate" },
  { value: "passport_photo", label: "Passport Size Photo" },
  { value: "other", label: "Other Document" },
];

interface DocItem {
  id: string;
  documentType: string;
  fileName: string;
  fileUrl: string;
  uploadedBy: string;
}

function DocProgress({ uploaded, total }: { uploaded: number; total: number }) {
  const pct = total > 0 ? Math.round((uploaded / total) * 100) : 0;
  const allDone = uploaded === total;
  return (
    <View style={styles.progressBox}>
      <View style={[styles.progressBar]}>
        <View style={[styles.progressFill, { width: `${pct}%` as any, backgroundColor: allDone ? COLORS.success : COLORS.gold }]} />
      </View>
      <Text style={styles.progressText}>{uploaded}/{total} documents</Text>
    </View>
  );
}

function BookingDocSection({ booking, baseUrl }: { booking: any; baseUrl: string }) {
  const { data: docs, refetch, isLoading } = useListDocuments(booking.id);
  const deleteDoc = useDeleteDocument();
  const [uploading, setUploading] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const allDocs: DocItem[] = (docs ?? []) as DocItem[];
  const myDocs = allDocs.filter(d => d.uploadedBy !== "admin");
  const travelDocs = allDocs.filter(d => d.uploadedBy === "admin" && TRAVEL_DOC_TYPES[d.documentType]);
  const uploadedTypes = myDocs.map(d => d.documentType);
  const uploadedMandatory = MANDATORY_DOCS.filter(m => uploadedTypes.includes(m.value)).length;

  const showUploadOptions = (docType: string, imageOnly: boolean) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    if (Platform.OS === "ios") {
      const options = imageOnly
        ? ["Cancel", "Take Photo", "Choose from Library"]
        : ["Cancel", "Take Photo", "Choose from Library", "Choose File (PDF)"];

      ActionSheetIOS.showActionSheetWithOptions(
        { options, cancelButtonIndex: 0 },
        async (idx) => {
          if (idx === 0) return;
          if (idx === 1) await pickWithCamera(docType);
          else if (idx === 2) await pickFromLibrary(docType);
          else if (idx === 3 && !imageOnly) await pickDocument(docType);
        }
      );
    } else {
      Alert.alert(
        "Upload Document",
        "Choose how to add your document",
        [
          { text: "Take Photo", onPress: () => pickWithCamera(docType) },
          { text: "Photo Library", onPress: () => pickFromLibrary(docType) },
          ...(!imageOnly ? [{ text: "Choose File (PDF)", onPress: () => pickDocument(docType) }] : []),
          { text: "Cancel", style: "cancel" as const },
        ]
      );
    }
  };

  const pickWithCamera = async (docType: string) => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission Required", "Camera access is needed to take photos.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.85 });
    if (!result.canceled && result.assets[0]) {
      await uploadImageAsset(result.assets[0], docType);
    }
  };

  const pickFromLibrary = async (docType: string) => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.85 });
    if (!result.canceled && result.assets[0]) {
      await uploadImageAsset(result.assets[0], docType);
    }
  };

  const pickDocument = async (docType: string) => {
    const result = await DocumentPicker.getDocumentAsync({
      type: ["application/pdf", "image/*"],
      copyToCacheDirectory: true,
    });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      await uploadRawFile({ uri: asset.uri, name: asset.name, mimeType: asset.mimeType ?? "application/pdf" }, docType);
    }
  };

  const uploadImageAsset = async (asset: ImagePicker.ImagePickerAsset, docType: string) => {
    const fileName = asset.uri.split("/").pop() ?? "document.jpg";
    await uploadRawFile({ uri: asset.uri, name: fileName, mimeType: asset.mimeType ?? "image/jpeg" }, docType);
  };

  const uploadRawFile = async (file: { uri: string; name: string; mimeType: string }, docType: string) => {
    setUploading(docType);
    try {
      const formData = new FormData();
      formData.append("file", { uri: file.uri, name: file.name, type: file.mimeType } as any);
      formData.append("bookingId", booking.id);
      formData.append("documentType", docType);

      const res = await fetch(`${baseUrl}/api/documents/upload`, {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Upload failed");
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await refetch();
    } catch (e: any) {
      Alert.alert("Upload Failed", e.message || "Something went wrong");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setUploading(null);
    }
  };

  const handleDelete = async (docId: string) => {
    Alert.alert("Remove Document", "Are you sure you want to remove this document?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove", style: "destructive",
        onPress: async () => {
          try {
            await deleteDoc.mutateAsync({ id: docId });
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            await refetch();
          } catch {}
        }
      }
    ]);
  };

  if (isLoading) {
    return (
      <View style={styles.loadingBox}>
        <ActivityIndicator color={COLORS.darkGreen} />
      </View>
    );
  }

  return (
    <View style={styles.bookingSection}>
      <View style={styles.bookingSectionHeader}>
        <View>
          <Text style={styles.bookingSectionTitle}>#{booking.bookingNumber}</Text>
          <Text style={styles.bookingSectionSub} numberOfLines={1}>
            {booking.packageName || booking.groupName || "Umrah Package"}
          </Text>
        </View>
        <DocProgress uploaded={uploadedMandatory} total={MANDATORY_DOCS.length} />
      </View>

      {/* Required Documents */}
      <Text style={styles.docSectionLabel}>Required Documents</Text>
      {MANDATORY_DOCS.map(doc => {
        const uploaded = myDocs.filter(d => d.documentType === doc.value);
        const isUploaded = uploaded.length > 0;
        const isUploadingThis = uploading === doc.value;
        return (
          <View key={doc.value} style={[styles.docRow, isUploaded && styles.docRowDone]}>
            <View style={[styles.docIcon, { backgroundColor: isUploaded ? COLORS.successBg : COLORS.surfaceAlt }]}>
              <Feather name={doc.icon} size={16} color={isUploaded ? COLORS.success : COLORS.textMuted} />
            </View>
            <View style={styles.docInfo}>
              <Text style={styles.docLabel}>{doc.label}</Text>
              {isUploaded && <Text style={styles.docFileName} numberOfLines={1}>{uploaded[0].fileName}</Text>}
              {!doc.imageOnly && <Text style={styles.docHint}>Image or PDF accepted</Text>}
            </View>
            <View style={styles.docActions}>
              {isUploaded ? (
                <>
                  <View style={styles.doneTag}>
                    <Feather name="check" size={11} color={COLORS.success} />
                    <Text style={styles.doneTagText}>Done</Text>
                  </View>
                  <Pressable onPress={() => handleDelete(uploaded[0].id)} style={styles.deleteBtn}>
                    <Feather name="trash-2" size={13} color={COLORS.error} />
                  </Pressable>
                </>
              ) : (
                <Pressable
                  onPress={() => showUploadOptions(doc.value, doc.imageOnly)}
                  disabled={isUploadingThis}
                  style={styles.uploadBtn}
                >
                  {isUploadingThis ? (
                    <ActivityIndicator size="small" color={COLORS.darkGreen} />
                  ) : (
                    <>
                      <Feather name="upload" size={13} color={COLORS.darkGreen} />
                      <Text style={styles.uploadBtnText}>Upload</Text>
                    </>
                  )}
                </Pressable>
              )}
            </View>
          </View>
        );
      })}

      {/* Other uploaded docs */}
      {myDocs.filter(d => !MANDATORY_DOCS.find(m => m.value === d.documentType)).length > 0 && (
        <>
          <Text style={[styles.docSectionLabel, { marginTop: 16 }]}>Other Documents</Text>
          {myDocs.filter(d => !MANDATORY_DOCS.find(m => m.value === d.documentType)).map(doc => (
            <View key={doc.id} style={styles.docRow}>
              <View style={styles.docIcon}>
                <Feather name="file" size={16} color={COLORS.textMuted} />
              </View>
              <View style={styles.docInfo}>
                <Text style={styles.docLabel}>{DOC_TYPES.find(t => t.value === doc.documentType)?.label ?? doc.documentType}</Text>
                <Text style={styles.docFileName} numberOfLines={1}>{doc.fileName}</Text>
              </View>
              <Pressable onPress={() => handleDelete(doc.id)} style={styles.deleteBtn}>
                <Feather name="trash-2" size={14} color={COLORS.error} />
              </Pressable>
            </View>
          ))}
        </>
      )}

      {/* Travel Documents from Admin */}
      {travelDocs.length > 0 && (
        <>
          <Text style={[styles.docSectionLabel, { marginTop: 20 }]}>Travel Documents from Al Burhan</Text>
          {travelDocs.map(doc => {
            const meta = TRAVEL_DOC_TYPES[doc.documentType];
            if (!meta) return null;
            return (
              <Pressable
                key={doc.id}
                style={[styles.travelDocRow, { backgroundColor: meta.bg }]}
                onPress={() => {
                  const url = `${baseUrl}${doc.fileUrl}`;
                  Linking.openURL(url).catch(() => Alert.alert("Cannot open file"));
                }}
              >
                <View style={[styles.travelDocIcon, { backgroundColor: meta.color + "20" }]}>
                  <Feather name={meta.icon as any} size={18} color={meta.color} />
                </View>
                <View style={styles.docInfo}>
                  <Text style={[styles.travelDocLabel, { color: meta.color }]}>{meta.label}</Text>
                  <Text style={styles.docFileName} numberOfLines={1}>{doc.fileName}</Text>
                </View>
                <Feather name="external-link" size={16} color={meta.color} />
              </Pressable>
            );
          })}
        </>
      )}
    </View>
  );
}

export default function DocumentsScreen() {
  const insets = useSafeAreaInsets();
  const { baseUrl } = useAuth();
  const { data, isLoading, refetch } = useListBookings();
  const [refreshing, setRefreshing] = useState(false);

  const bookings = (data as BookingListResponse | undefined)?.bookings ?? [];

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const topPad = Platform.OS === "web" ? 67 : insets.top;

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: COLORS.background }]}
      contentInsetAdjustmentBehavior="automatic"
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.darkGreen} />
      }
    >
      <View style={[styles.pageHeader, { paddingTop: topPad + 20 }]}>
        <Text style={styles.pageTitle}>Documents</Text>
        <Text style={styles.pageSubtitle}>Upload your documents and view travel papers</Text>
      </View>

      <View style={styles.content}>
        {isLoading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color={COLORS.darkGreen} />
            <Text style={styles.loadingText}>Loading…</Text>
          </View>
        ) : bookings.length === 0 ? (
          <View style={styles.emptyBox}>
            <Feather name="folder" size={40} color={COLORS.border} />
            <Text style={styles.emptyTitle}>No Bookings Found</Text>
            <Text style={styles.emptyText}>Documents will appear here once you have a booking</Text>
          </View>
        ) : (
          bookings.map(b => (
            <BookingDocSection key={b.id} booking={b} baseUrl={baseUrl} />
          ))
        )}
      </View>

      <View style={{ height: Platform.OS === "web" ? 34 : insets.bottom + 100 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  pageHeader: {
    backgroundColor: COLORS.darkGreen,
    paddingHorizontal: 24,
    paddingBottom: 28,
  },
  pageTitle: {
    fontSize: 26,
    fontFamily: "Inter_700Bold",
    color: "#FFFFFF",
    marginBottom: 4,
  },
  pageSubtitle: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.7)",
  },
  content: {
    padding: 16,
    gap: 16,
  },
  loadingBox: {
    alignItems: "center",
    paddingVertical: 48,
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: COLORS.textMuted,
  },
  emptyBox: {
    alignItems: "center",
    paddingVertical: 48,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: COLORS.textSecondary,
    marginTop: 8,
  },
  emptyText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: COLORS.textMuted,
    textAlign: "center",
  },
  bookingSection: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 16,
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 3,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  bookingSectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 16,
  },
  bookingSectionTitle: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
    color: COLORS.darkGreen,
  },
  bookingSectionSub: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: COLORS.textMuted,
    marginTop: 2,
    maxWidth: 140,
  },
  progressBox: {
    alignItems: "flex-end",
    gap: 4,
  },
  progressBar: {
    width: 80,
    height: 6,
    backgroundColor: COLORS.border,
    borderRadius: 3,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 3,
  },
  progressText: {
    fontSize: 10,
    fontFamily: "Inter_500Medium",
    color: COLORS.textMuted,
  },
  docSectionLabel: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    color: COLORS.textMuted,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    marginBottom: 10,
  },
  docRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  docRowDone: {
    opacity: 1,
  },
  docIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.surfaceAlt,
  },
  docInfo: {
    flex: 1,
    gap: 2,
  },
  docLabel: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: COLORS.text,
  },
  docFileName: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: COLORS.textMuted,
  },
  docHint: {
    fontSize: 10,
    fontFamily: "Inter_400Regular",
    color: COLORS.border,
  },
  docActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  doneTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: COLORS.successBg,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  doneTagText: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    color: COLORS.success,
  },
  uploadBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: COLORS.surfaceAlt,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: COLORS.border,
    minWidth: 70,
    justifyContent: "center",
  },
  uploadBtnText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    color: COLORS.darkGreen,
  },
  deleteBtn: {
    padding: 6,
  },
  travelDocRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },
  travelDocIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  travelDocLabel: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
  },
});
