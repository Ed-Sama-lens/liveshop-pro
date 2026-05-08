-- Migration: add_unified_inbox_and_sale_mvp
-- Phase: Commit 1 — schema additive only
-- See docs/superpowers/2026-04-06-sale-mvp-dissent.md
-- Adds: 7 tables (Conversation, ChannelIdentity, Message, CommentParseLog,
--       BroadcastProduct, Booking, BookingHistory), 9 enums, 1 enum value
--       (MessageDirection.SYSTEM), 1 nullable column (StockReservation.bookingId).
-- Zero drops, zero renames, zero data transforms.

-- CreateEnum
CREATE TYPE "Platform" AS ENUM ('FACEBOOK', 'MESSENGER', 'WHATSAPP', 'TELEGRAM', 'MANUAL');

-- CreateEnum
CREATE TYPE "ConversationSource" AS ENUM ('LIVE_COMMENT', 'PAGE_INBOX', 'POST_COMMENT', 'WHATSAPP_CHAT', 'TELEGRAM_CHAT', 'MANUAL');

-- CreateEnum
CREATE TYPE "ConversationStatus" AS ENUM ('OPEN', 'PENDING_REVIEW', 'PENDING_PAYMENT', 'ORDER_CREATED', 'CLOSED', 'SPAM');

-- CreateEnum
CREATE TYPE "MessageType" AS ENUM ('TEXT', 'IMAGE', 'VIDEO', 'AUDIO', 'FILE', 'PRODUCT_CARD', 'ORDER_SUMMARY', 'PAYMENT_PROOF', 'TEMPLATE', 'SYSTEM');

-- CreateEnum
CREATE TYPE "MessageStatus" AS ENUM ('RECEIVED', 'QUEUED', 'SENT', 'DELIVERED', 'READ', 'FAILED', 'IGNORED');

-- CreateEnum
CREATE TYPE "ParseStatus" AS ENUM ('UNPARSED', 'PARSED_PENDING_REVIEW', 'PARSED_AUTO_BOOKED', 'PARSED_NO_MATCH', 'IGNORED');

-- CreateEnum
CREATE TYPE "ParseAction" AS ENUM ('BOOK', 'CANCEL', 'INCREMENT', 'DECREMENT', 'QUERY');

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('PENDING_REVIEW', 'CONFIRMED', 'CANCELLED', 'EXPIRED', 'CONVERTED_TO_ORDER');

-- CreateEnum
CREATE TYPE "BookingSource" AS ENUM ('MANUAL', 'LIVE_COMMENT', 'PAGE_INBOX', 'POST_COMMENT', 'WHATSAPP_CHAT', 'TELEGRAM_CHAT', 'IMPORT', 'SYSTEM');

-- AlterEnum
ALTER TYPE "MessageDirection" ADD VALUE 'SYSTEM';

-- AlterTable
ALTER TABLE "StockReservation" ADD COLUMN     "bookingId" TEXT;

-- CreateTable
CREATE TABLE "Conversation" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "customerId" TEXT,
    "source" "ConversationSource" NOT NULL,
    "status" "ConversationStatus" NOT NULL DEFAULT 'OPEN',
    "assignedToId" TEXT,
    "liveSessionId" TEXT,
    "lastMessageAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChannelIdentity" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "customerId" TEXT,
    "platform" "Platform" NOT NULL,
    "platformUserId" TEXT NOT NULL,
    "platformThreadId" TEXT,
    "displayName" TEXT,
    "avatarUrl" TEXT,
    "phone" TEXT,
    "profileUrl" TEXT,
    "metadata" JSONB,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChannelIdentity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "conversationId" TEXT,
    "channelIdentityId" TEXT,
    "liveSessionId" TEXT,
    "platform" "Platform" NOT NULL,
    "source" "ConversationSource" NOT NULL,
    "direction" "MessageDirection" NOT NULL,
    "type" "MessageType" NOT NULL DEFAULT 'TEXT',
    "externalMessageId" TEXT,
    "externalThreadId" TEXT,
    "senderPlatformId" TEXT,
    "senderName" TEXT,
    "text" TEXT,
    "mediaUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "rawPayload" JSONB,
    "rawPayloadRedactedAt" TIMESTAMP(3),
    "retentionUntil" TIMESTAMP(3),
    "status" "MessageStatus" NOT NULL DEFAULT 'RECEIVED',
    "parseStatus" "ParseStatus" NOT NULL DEFAULT 'UNPARSED',
    "receivedAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommentParseLog" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "parserVersion" TEXT NOT NULL,
    "matchedCode" TEXT,
    "matchedVariantId" TEXT,
    "parsedQuantity" INTEGER,
    "parsedAction" "ParseAction",
    "confidence" DECIMAL(3,2),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommentParseLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BroadcastProduct" (
    "id" TEXT NOT NULL,
    "liveSessionId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "variantId" TEXT,
    "displayCode" TEXT NOT NULL,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "priceOverride" DECIMAL(12,2),
    "isPinned" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BroadcastProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Booking" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "liveSessionId" TEXT NOT NULL,
    "broadcastProductId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "conversationId" TEXT,
    "channelIdentityId" TEXT,
    "sourceMessageId" TEXT,
    "quantity" INTEGER NOT NULL,
    "unitPrice" DECIMAL(12,2) NOT NULL,
    "status" "BookingStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "source" "BookingSource" NOT NULL DEFAULT 'MANUAL',
    "notes" TEXT,
    "idempotencyKey" TEXT,
    "createdById" TEXT,
    "convertedOrderId" TEXT,
    "expiresAt" TIMESTAMP(3),
    "releasedAt" TIMESTAMP(3),
    "releaseReason" TEXT,
    "cancellationReason" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Booking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingHistory" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "fromStatus" "BookingStatus",
    "toStatus" "BookingStatus" NOT NULL,
    "changedById" TEXT,
    "reason" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BookingHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Conversation_shopId_status_lastMessageAt_idx" ON "Conversation"("shopId", "status", "lastMessageAt");

-- CreateIndex
CREATE INDEX "Conversation_customerId_idx" ON "Conversation"("customerId");

-- CreateIndex
CREATE INDEX "Conversation_liveSessionId_idx" ON "Conversation"("liveSessionId");

-- CreateIndex
CREATE INDEX "Conversation_assignedToId_idx" ON "Conversation"("assignedToId");

-- CreateIndex
CREATE INDEX "ChannelIdentity_shopId_platform_idx" ON "ChannelIdentity"("shopId", "platform");

-- CreateIndex
CREATE INDEX "ChannelIdentity_customerId_idx" ON "ChannelIdentity"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "ChannelIdentity_shopId_platform_platformUserId_key" ON "ChannelIdentity"("shopId", "platform", "platformUserId");

-- CreateIndex
CREATE INDEX "Message_shopId_receivedAt_idx" ON "Message"("shopId", "receivedAt");

-- CreateIndex
CREATE INDEX "Message_conversationId_createdAt_idx" ON "Message"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "Message_channelIdentityId_idx" ON "Message"("channelIdentityId");

-- CreateIndex
CREATE INDEX "Message_liveSessionId_idx" ON "Message"("liveSessionId");

-- CreateIndex
CREATE INDEX "Message_parseStatus_idx" ON "Message"("parseStatus");

-- CreateIndex
CREATE INDEX "Message_status_idx" ON "Message"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Message_shopId_platform_externalMessageId_key" ON "Message"("shopId", "platform", "externalMessageId");

-- CreateIndex
CREATE INDEX "CommentParseLog_messageId_idx" ON "CommentParseLog"("messageId");

-- CreateIndex
CREATE INDEX "BroadcastProduct_liveSessionId_displayOrder_idx" ON "BroadcastProduct"("liveSessionId", "displayOrder");

-- CreateIndex
CREATE INDEX "BroadcastProduct_productId_idx" ON "BroadcastProduct"("productId");

-- CreateIndex
CREATE INDEX "BroadcastProduct_variantId_idx" ON "BroadcastProduct"("variantId");

-- CreateIndex
CREATE UNIQUE INDEX "BroadcastProduct_liveSessionId_displayCode_key" ON "BroadcastProduct"("liveSessionId", "displayCode");

-- CreateIndex
CREATE INDEX "Booking_shopId_status_idx" ON "Booking"("shopId", "status");

-- CreateIndex
CREATE INDEX "Booking_liveSessionId_status_idx" ON "Booking"("liveSessionId", "status");

-- CreateIndex
CREATE INDEX "Booking_broadcastProductId_status_idx" ON "Booking"("broadcastProductId", "status");

-- CreateIndex
CREATE INDEX "Booking_customerId_status_idx" ON "Booking"("customerId", "status");

-- CreateIndex
CREATE INDEX "Booking_sourceMessageId_idx" ON "Booking"("sourceMessageId");

-- CreateIndex
CREATE INDEX "Booking_conversationId_idx" ON "Booking"("conversationId");

-- CreateIndex
CREATE INDEX "Booking_channelIdentityId_idx" ON "Booking"("channelIdentityId");

-- CreateIndex
CREATE INDEX "Booking_convertedOrderId_idx" ON "Booking"("convertedOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "Booking_shopId_idempotencyKey_key" ON "Booking"("shopId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "BookingHistory_bookingId_createdAt_idx" ON "BookingHistory"("bookingId", "createdAt");

-- CreateIndex
CREATE INDEX "BookingHistory_changedById_idx" ON "BookingHistory"("changedById");

-- CreateIndex
CREATE INDEX "StockReservation_bookingId_idx" ON "StockReservation"("bookingId");

-- AddForeignKey
ALTER TABLE "StockReservation" ADD CONSTRAINT "StockReservation_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_liveSessionId_fkey" FOREIGN KEY ("liveSessionId") REFERENCES "LiveSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChannelIdentity" ADD CONSTRAINT "ChannelIdentity_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChannelIdentity" ADD CONSTRAINT "ChannelIdentity_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_channelIdentityId_fkey" FOREIGN KEY ("channelIdentityId") REFERENCES "ChannelIdentity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_liveSessionId_fkey" FOREIGN KEY ("liveSessionId") REFERENCES "LiveSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommentParseLog" ADD CONSTRAINT "CommentParseLog_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommentParseLog" ADD CONSTRAINT "CommentParseLog_matchedVariantId_fkey" FOREIGN KEY ("matchedVariantId") REFERENCES "ProductVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BroadcastProduct" ADD CONSTRAINT "BroadcastProduct_liveSessionId_fkey" FOREIGN KEY ("liveSessionId") REFERENCES "LiveSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BroadcastProduct" ADD CONSTRAINT "BroadcastProduct_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BroadcastProduct" ADD CONSTRAINT "BroadcastProduct_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_liveSessionId_fkey" FOREIGN KEY ("liveSessionId") REFERENCES "LiveSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_broadcastProductId_fkey" FOREIGN KEY ("broadcastProductId") REFERENCES "BroadcastProduct"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_channelIdentityId_fkey" FOREIGN KEY ("channelIdentityId") REFERENCES "ChannelIdentity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_sourceMessageId_fkey" FOREIGN KEY ("sourceMessageId") REFERENCES "Message"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_convertedOrderId_fkey" FOREIGN KEY ("convertedOrderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingHistory" ADD CONSTRAINT "BookingHistory_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingHistory" ADD CONSTRAINT "BookingHistory_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

