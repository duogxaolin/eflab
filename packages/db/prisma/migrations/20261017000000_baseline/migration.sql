-- Baseline migration generated from the committed schema with
--   prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script
-- and prefixed with the two extensions that player search needs. The live dev
-- database was created with `prisma db push`, so it is marked applied with
--   prisma migrate resolve --applied 20261017000000_baseline
-- Fresh databases get it through `prisma migrate deploy` (pnpm db:migrate).

CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('USER', 'MODERATOR', 'ADMIN');

-- CreateEnum
CREATE TYPE "CardType" AS ENUM ('STANDARD', 'TRENDING', 'EPIC', 'BIG_TIME', 'HIGHLIGHT', 'SHOW_TIME', 'STRIKE_ARENA', 'LEGENDARY');

-- CreateTable
CREATE TABLE "Player" (
    "id" BIGINT NOT NULL,
    "baseId" BIGINT NOT NULL,
    "name" TEXT NOT NULL,
    "accentedName" TEXT,
    "japName" TEXT,
    "chineseName" TEXT,
    "shirt" TEXT,
    "shirtNational" TEXT,
    "nationalityId" INTEGER NOT NULL,
    "country2Id" INTEGER,
    "height" INTEGER NOT NULL,
    "weight" INTEGER NOT NULL,
    "age" INTEGER NOT NULL,
    "strongerFoot" INTEGER NOT NULL DEFAULT 0,
    "registeredPosition" INTEGER NOT NULL,
    "playingStyleAttack" INTEGER NOT NULL DEFAULT 0,
    "playingStyleDefense" INTEGER NOT NULL DEFAULT 0,
    "cardType" "CardType" NOT NULL,
    "featuredPackId" TEXT,
    "dreamTeam" BOOLEAN NOT NULL DEFAULT false,
    "ovr" INTEGER NOT NULL,
    "maxOvr" INTEGER NOT NULL,
    "condition" TEXT NOT NULL DEFAULT 'B',
    "form" INTEGER NOT NULL DEFAULT 1,
    "injuryResistance" INTEGER NOT NULL DEFAULT 1,
    "weakFootUsage" INTEGER NOT NULL DEFAULT 0,
    "weakFootAccuracy" INTEGER NOT NULL DEFAULT 0,
    "releaseDate" TIMESTAMP(3),
    "datapackId" INTEGER NOT NULL DEFAULT 20251204,
    "levelCap" INTEGER NOT NULL DEFAULT 50,
    "cost" INTEGER NOT NULL DEFAULT 0,
    "variation" INTEGER NOT NULL DEFAULT 0,
    "stars" INTEGER NOT NULL DEFAULT 0,
    "marketValue" INTEGER NOT NULL DEFAULT 0,
    "reputation" INTEGER NOT NULL DEFAULT 0,
    "overallPotential" INTEGER NOT NULL DEFAULT 0,
    "boosterId1" INTEGER,
    "boosterId2" INTEGER,
    "teamId" INTEGER,
    "views" INTEGER NOT NULL DEFAULT 0,
    "ratingCount" INTEGER NOT NULL DEFAULT 0,
    "avgRating" DOUBLE PRECISION,
    "offensiveAwareness" INTEGER NOT NULL DEFAULT 40,
    "ballControl" INTEGER NOT NULL DEFAULT 40,
    "dribbling" INTEGER NOT NULL DEFAULT 40,
    "tightPossession" INTEGER NOT NULL DEFAULT 40,
    "lowPass" INTEGER NOT NULL DEFAULT 40,
    "loftedPass" INTEGER NOT NULL DEFAULT 40,
    "finishing" INTEGER NOT NULL DEFAULT 40,
    "heading" INTEGER NOT NULL DEFAULT 40,
    "placeKicking" INTEGER NOT NULL DEFAULT 40,
    "curl" INTEGER NOT NULL DEFAULT 40,
    "speed" INTEGER NOT NULL DEFAULT 40,
    "acceleration" INTEGER NOT NULL DEFAULT 40,
    "kickingPower" INTEGER NOT NULL DEFAULT 40,
    "jump" INTEGER NOT NULL DEFAULT 40,
    "physicalContact" INTEGER NOT NULL DEFAULT 40,
    "balance" INTEGER NOT NULL DEFAULT 40,
    "stamina" INTEGER NOT NULL DEFAULT 40,
    "defensiveAwareness" INTEGER NOT NULL DEFAULT 40,
    "ballWinning" INTEGER NOT NULL DEFAULT 40,
    "defensiveEngagement" INTEGER NOT NULL DEFAULT 40,
    "aggression" INTEGER NOT NULL DEFAULT 40,
    "gkAwareness" INTEGER NOT NULL DEFAULT 40,
    "gkCatching" INTEGER NOT NULL DEFAULT 40,
    "gkParrying" INTEGER NOT NULL DEFAULT 40,
    "gkReflexes" INTEGER NOT NULL DEFAULT 40,
    "gkReach" INTEGER NOT NULL DEFAULT 40,
    "gkClearing" INTEGER NOT NULL DEFAULT 40,
    "maxOffensiveAwareness" INTEGER NOT NULL DEFAULT 40,
    "maxBallControl" INTEGER NOT NULL DEFAULT 40,
    "maxDribbling" INTEGER NOT NULL DEFAULT 40,
    "maxTightPossession" INTEGER NOT NULL DEFAULT 40,
    "maxLowPass" INTEGER NOT NULL DEFAULT 40,
    "maxLoftedPass" INTEGER NOT NULL DEFAULT 40,
    "maxFinishing" INTEGER NOT NULL DEFAULT 40,
    "maxHeading" INTEGER NOT NULL DEFAULT 40,
    "maxPlaceKicking" INTEGER NOT NULL DEFAULT 40,
    "maxCurl" INTEGER NOT NULL DEFAULT 40,
    "maxSpeed" INTEGER NOT NULL DEFAULT 40,
    "maxAcceleration" INTEGER NOT NULL DEFAULT 40,
    "maxKickingPower" INTEGER NOT NULL DEFAULT 40,
    "maxJump" INTEGER NOT NULL DEFAULT 40,
    "maxPhysicalContact" INTEGER NOT NULL DEFAULT 40,
    "maxBalance" INTEGER NOT NULL DEFAULT 40,
    "maxStamina" INTEGER NOT NULL DEFAULT 40,
    "maxDefensiveAwareness" INTEGER NOT NULL DEFAULT 40,
    "maxBallWinning" INTEGER NOT NULL DEFAULT 40,
    "maxDefensiveEngagement" INTEGER NOT NULL DEFAULT 40,
    "maxAggression" INTEGER NOT NULL DEFAULT 40,
    "maxGkAwareness" INTEGER NOT NULL DEFAULT 40,
    "maxGkCatching" INTEGER NOT NULL DEFAULT 40,
    "maxGkParrying" INTEGER NOT NULL DEFAULT 40,
    "maxGkReflexes" INTEGER NOT NULL DEFAULT 40,
    "maxGkReach" INTEGER NOT NULL DEFAULT 40,
    "maxGkClearing" INTEGER NOT NULL DEFAULT 40,
    "posGK" INTEGER NOT NULL DEFAULT 2,
    "posCB" INTEGER NOT NULL DEFAULT 2,
    "posLB" INTEGER NOT NULL DEFAULT 2,
    "posRB" INTEGER NOT NULL DEFAULT 2,
    "posDMF" INTEGER NOT NULL DEFAULT 2,
    "posCMF" INTEGER NOT NULL DEFAULT 2,
    "posLMF" INTEGER NOT NULL DEFAULT 2,
    "posRMF" INTEGER NOT NULL DEFAULT 2,
    "posAMF" INTEGER NOT NULL DEFAULT 2,
    "posLWF" INTEGER NOT NULL DEFAULT 2,
    "posRWF" INTEGER NOT NULL DEFAULT 2,
    "posSS" INTEGER NOT NULL DEFAULT 2,
    "posCF" INTEGER NOT NULL DEFAULT 2,
    "ratingGK" INTEGER NOT NULL DEFAULT 40,
    "ratingCB" INTEGER NOT NULL DEFAULT 40,
    "ratingLB" INTEGER NOT NULL DEFAULT 40,
    "ratingRB" INTEGER NOT NULL DEFAULT 40,
    "ratingDMF" INTEGER NOT NULL DEFAULT 40,
    "ratingCMF" INTEGER NOT NULL DEFAULT 40,
    "ratingLMF" INTEGER NOT NULL DEFAULT 40,
    "ratingRMF" INTEGER NOT NULL DEFAULT 40,
    "ratingAMF" INTEGER NOT NULL DEFAULT 40,
    "ratingLWF" INTEGER NOT NULL DEFAULT 40,
    "ratingRWF" INTEGER NOT NULL DEFAULT 40,
    "ratingSS" INTEGER NOT NULL DEFAULT 40,
    "ratingCF" INTEGER NOT NULL DEFAULT 40,
    "neckLength" INTEGER NOT NULL DEFAULT 5,
    "neckSize" INTEGER NOT NULL DEFAULT 5,
    "shoulderHeight" INTEGER NOT NULL DEFAULT 5,
    "shoulderWidth" INTEGER NOT NULL DEFAULT 5,
    "chestMeasurement" INTEGER NOT NULL DEFAULT 5,
    "waistSize" INTEGER NOT NULL DEFAULT 5,
    "armSize" INTEGER NOT NULL DEFAULT 5,
    "armLength" INTEGER NOT NULL DEFAULT 5,
    "thighSize" INTEGER NOT NULL DEFAULT 5,
    "calfSize" INTEGER NOT NULL DEFAULT 5,
    "legLength" INTEGER NOT NULL DEFAULT 5,
    "legCoverage" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "armCoverage" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "peakJumpHeight" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "torsoCollisionWidth" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "dribbleHeight" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "possessionGame" INTEGER NOT NULL DEFAULT 0,
    "quickCounter" INTEGER NOT NULL DEFAULT 0,
    "longBallCounter" INTEGER NOT NULL DEFAULT 0,
    "outWide" INTEGER NOT NULL DEFAULT 0,
    "longBall" INTEGER NOT NULL DEFAULT 0,
    "trickster" BOOLEAN NOT NULL DEFAULT false,
    "mazingRun" BOOLEAN NOT NULL DEFAULT false,
    "speedingBullet" BOOLEAN NOT NULL DEFAULT false,
    "incisiveRun" BOOLEAN NOT NULL DEFAULT false,
    "longBallExpert" BOOLEAN NOT NULL DEFAULT false,
    "earlyCross" BOOLEAN NOT NULL DEFAULT false,
    "communityTier" TEXT,

    CONSTRAINT "Player_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Manager" (
    "id" BIGINT NOT NULL,
    "name" TEXT NOT NULL,
    "accentedName" TEXT,
    "japName" TEXT,
    "chineseName" TEXT,
    "age" INTEGER NOT NULL DEFAULT 50,
    "country" INTEGER NOT NULL DEFAULT 0,
    "adaptability" INTEGER NOT NULL DEFAULT 0,
    "affinity" INTEGER NOT NULL DEFAULT 0,
    "marketValue" INTEGER NOT NULL DEFAULT 0,
    "rating" INTEGER NOT NULL DEFAULT 0,
    "imageUrl" TEXT,
    "possessionGame" INTEGER NOT NULL DEFAULT 0,
    "quickCounter" INTEGER NOT NULL DEFAULT 0,
    "longBallCounter" INTEGER NOT NULL DEFAULT 0,
    "outWide" INTEGER NOT NULL DEFAULT 0,
    "longBall" INTEGER NOT NULL DEFAULT 0,
    "overload" INTEGER NOT NULL DEFAULT 0,
    "boostId1" INTEGER,
    "boostId2" INTEGER,
    "booster1Stat" TEXT,
    "booster2Stat" TEXT,

    CONSTRAINT "Manager_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Booster" (
    "id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "japName" TEXT,
    "tier" TEXT NOT NULL DEFAULT 'basic',
    "version" INTEGER NOT NULL DEFAULT 0,
    "magnitude" INTEGER NOT NULL DEFAULT 2,
    "maxMagnitude" INTEGER NOT NULL DEFAULT 4,
    "color" INTEGER NOT NULL DEFAULT 0,
    "offensiveAwareness" INTEGER DEFAULT 0,
    "ballControl" INTEGER DEFAULT 0,
    "dribbling" INTEGER DEFAULT 0,
    "tightPossession" INTEGER DEFAULT 0,
    "lowPass" INTEGER DEFAULT 0,
    "loftedPass" INTEGER DEFAULT 0,
    "finishing" INTEGER DEFAULT 0,
    "placeKicking" INTEGER DEFAULT 0,
    "curl" INTEGER DEFAULT 0,
    "heading" INTEGER DEFAULT 0,
    "defensiveAwareness" INTEGER DEFAULT 0,
    "defensiveEngagement" INTEGER DEFAULT 0,
    "ballWinning" INTEGER DEFAULT 0,
    "aggression" INTEGER DEFAULT 0,
    "kickingPower" INTEGER DEFAULT 0,
    "speed" INTEGER DEFAULT 0,
    "acceleration" INTEGER DEFAULT 0,
    "balance" INTEGER DEFAULT 0,
    "physicalContact" INTEGER DEFAULT 0,
    "jump" INTEGER DEFAULT 0,
    "stamina" INTEGER DEFAULT 0,
    "gkAwareness" INTEGER DEFAULT 0,
    "gkCatching" INTEGER DEFAULT 0,
    "gkParrying" INTEGER DEFAULT 0,
    "gkReflexes" INTEGER DEFAULT 0,
    "gkReach" INTEGER DEFAULT 0,
    "weakFootAccuracy" INTEGER DEFAULT 0,

    CONSTRAINT "Booster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Skill" (
    "id" INTEGER NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "category" TEXT NOT NULL DEFAULT 'General',

    CONSTRAINT "Skill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlayerSkill" (
    "playerId" BIGINT NOT NULL,
    "skillId" INTEGER NOT NULL,

    CONSTRAINT "PlayerSkill_pkey" PRIMARY KEY ("playerId","skillId")
);

-- CreateTable
CREATE TABLE "Pack" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "releaseDate" TIMESTAMP(3) NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'pack',
    "playerCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Pack_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PackCard" (
    "packId" TEXT NOT NULL,
    "playerId" BIGINT NOT NULL,

    CONSTRAINT "PackCard_pkey" PRIMARY KEY ("packId","playerId")
);

-- CreateTable
CREATE TABLE "FeaturedBundle" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "releaseDate" TIMESTAMP(3) NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "FeaturedBundle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeaturedBundleCard" (
    "bundleId" INTEGER NOT NULL,
    "playerId" BIGINT NOT NULL,
    "ordinal" INTEGER NOT NULL,

    CONSTRAINT "FeaturedBundleCard_pkey" PRIMARY KEY ("bundleId","playerId")
);

-- CreateTable
CREATE TABLE "Team" (
    "id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "countryId" INTEGER,
    "leagueId" INTEGER,
    "national" BOOLEAN NOT NULL DEFAULT false,
    "emblemUrl" TEXT,

    CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Country" (
    "id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "region" TEXT,
    "continent" TEXT,
    "flagUrl" TEXT,

    CONSTRAINT "Country_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "League" (
    "id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "region" TEXT,
    "emblemUrl" TEXT,

    CONSTRAINT "League_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "displayName" TEXT,
    "region" TEXT,
    "country" TEXT,
    "avatarUrl" TEXT,
    "isPro" BOOLEAN NOT NULL DEFAULT false,
    "proUntil" TIMESTAMP(3),
    "role" "Role" NOT NULL DEFAULT 'USER',
    "followersCount" INTEGER NOT NULL DEFAULT 0,
    "followingCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Build" (
    "id" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "playerId" BIGINT NOT NULL,
    "managerId" BIGINT,
    "level" INTEGER NOT NULL,
    "trainingPoints" JSONB NOT NULL,
    "boosters" JSONB NOT NULL,
    "note" TEXT,
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "isPro" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Build_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Review" (
    "id" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "playerId" BIGINT NOT NULL,
    "rating" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TierVote" (
    "userId" TEXT NOT NULL,
    "playerId" BIGINT NOT NULL,
    "tier" TEXT NOT NULL,

    CONSTRAINT "TierVote_pkey" PRIMARY KEY ("userId","playerId")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerType" TEXT NOT NULL DEFAULT 'oauth',
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "passwordHashed" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Follow" (
    "followerId" TEXT NOT NULL,
    "followingId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Follow_pkey" PRIMARY KEY ("followerId","followingId")
);

-- CreateTable
CREATE TABLE "Post" (
    "id" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "mediaUrls" TEXT[],
    "playerId" BIGINT,
    "region" TEXT,
    "country" TEXT,
    "likesCount" INTEGER NOT NULL DEFAULT 0,
    "commentsCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Post_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PostLike" (
    "postId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PostLike_pkey" PRIMARY KEY ("postId","userId")
);

-- CreateTable
CREATE TABLE "Comment" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Comment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TierList" (
    "id" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tiers" JSONB NOT NULL,
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "submissions" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TierList_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Player_baseId_idx" ON "Player"("baseId");

-- CreateIndex
CREATE INDEX "Player_cardType_idx" ON "Player"("cardType");

-- CreateIndex
CREATE INDEX "Player_ovr_idx" ON "Player"("ovr");

-- CreateIndex
CREATE INDEX "Player_maxOvr_idx" ON "Player"("maxOvr");

-- CreateIndex
CREATE INDEX "Player_name_idx" ON "Player"("name");

-- CreateIndex
CREATE INDEX "Player_nationalityId_registeredPosition_idx" ON "Player"("nationalityId", "registeredPosition");

-- CreateIndex
CREATE INDEX "Player_ovr_cardType_idx" ON "Player"("ovr", "cardType");

-- CreateIndex
CREATE INDEX "Player_teamId_idx" ON "Player"("teamId");

-- CreateIndex
CREATE INDEX "Player_cardType_ovr_idx" ON "Player"("cardType", "ovr");

-- CreateIndex
CREATE INDEX "Player_registeredPosition_ovr_idx" ON "Player"("registeredPosition", "ovr");

-- CreateIndex
CREATE INDEX "Player_nationalityId_ovr_idx" ON "Player"("nationalityId", "ovr");

-- CreateIndex
CREATE INDEX "Manager_name_idx" ON "Manager"("name");

-- CreateIndex
CREATE INDEX "Booster_tier_idx" ON "Booster"("tier");

-- CreateIndex
CREATE UNIQUE INDEX "Skill_slug_key" ON "Skill"("slug");

-- CreateIndex
CREATE INDEX "Skill_category_idx" ON "Skill"("category");

-- CreateIndex
CREATE INDEX "PlayerSkill_skillId_idx" ON "PlayerSkill"("skillId");

-- CreateIndex
CREATE INDEX "Pack_type_idx" ON "Pack"("type");

-- CreateIndex
CREATE UNIQUE INDEX "FeaturedBundle_slug_key" ON "FeaturedBundle"("slug");

-- CreateIndex
CREATE INDEX "FeaturedBundle_releaseDate_position_idx" ON "FeaturedBundle"("releaseDate", "position");

-- CreateIndex
CREATE INDEX "FeaturedBundleCard_bundleId_ordinal_idx" ON "FeaturedBundleCard"("bundleId", "ordinal");

-- CreateIndex
CREATE INDEX "FeaturedBundleCard_playerId_idx" ON "FeaturedBundleCard"("playerId");

-- CreateIndex
CREATE INDEX "Team_leagueId_idx" ON "Team"("leagueId");

-- CreateIndex
CREATE INDEX "Team_countryId_idx" ON "Team"("countryId");

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_username_idx" ON "User"("username");

-- CreateIndex
CREATE INDEX "Build_playerId_isPublic_idx" ON "Build"("playerId", "isPublic");

-- CreateIndex
CREATE INDEX "Build_authorId_idx" ON "Build"("authorId");

-- CreateIndex
CREATE INDEX "Review_playerId_idx" ON "Review"("playerId");

-- CreateIndex
CREATE INDEX "TierVote_playerId_idx" ON "TierVote"("playerId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_token_key" ON "Session"("token");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Account_userId_idx" ON "Account"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Account_providerId_accountId_key" ON "Account"("providerId", "accountId");

-- CreateIndex
CREATE INDEX "Follow_followingId_idx" ON "Follow"("followingId");

-- CreateIndex
CREATE INDEX "Post_authorId_idx" ON "Post"("authorId");

-- CreateIndex
CREATE INDEX "Post_createdAt_idx" ON "Post"("createdAt");

-- CreateIndex
CREATE INDEX "Post_region_idx" ON "Post"("region");

-- CreateIndex
CREATE INDEX "Post_country_idx" ON "Post"("country");

-- CreateIndex
CREATE INDEX "PostLike_userId_idx" ON "PostLike"("userId");

-- CreateIndex
CREATE INDEX "Comment_postId_idx" ON "Comment"("postId");

-- CreateIndex
CREATE INDEX "Comment_authorId_idx" ON "Comment"("authorId");

-- CreateIndex
CREATE INDEX "TierList_authorId_idx" ON "TierList"("authorId");

-- CreateIndex
CREATE INDEX "TierList_createdAt_idx" ON "TierList"("createdAt");

-- CreateIndex
CREATE INDEX "TierList_isPublic_idx" ON "TierList"("isPublic");

-- AddForeignKey
ALTER TABLE "Player" ADD CONSTRAINT "Player_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerSkill" ADD CONSTRAINT "PlayerSkill_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerSkill" ADD CONSTRAINT "PlayerSkill_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackCard" ADD CONSTRAINT "PackCard_packId_fkey" FOREIGN KEY ("packId") REFERENCES "Pack"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackCard" ADD CONSTRAINT "PackCard_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeaturedBundleCard" ADD CONSTRAINT "FeaturedBundleCard_bundleId_fkey" FOREIGN KEY ("bundleId") REFERENCES "FeaturedBundle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeaturedBundleCard" ADD CONSTRAINT "FeaturedBundleCard_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Team" ADD CONSTRAINT "Team_countryId_fkey" FOREIGN KEY ("countryId") REFERENCES "Country"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Team" ADD CONSTRAINT "Team_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Build" ADD CONSTRAINT "Build_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Build" ADD CONSTRAINT "Build_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Build" ADD CONSTRAINT "Build_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "Manager"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TierVote" ADD CONSTRAINT "TierVote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TierVote" ADD CONSTRAINT "TierVote_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Follow" ADD CONSTRAINT "Follow_followerId_fkey" FOREIGN KEY ("followerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Follow" ADD CONSTRAINT "Follow_followingId_fkey" FOREIGN KEY ("followingId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostLike" ADD CONSTRAINT "PostLike_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostLike" ADD CONSTRAINT "PostLike_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TierList" ADD CONSTRAINT "TierList_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

