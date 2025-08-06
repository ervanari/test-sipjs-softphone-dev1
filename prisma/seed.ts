const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('Starting seed...');

  // Clear existing data
  await prisma.callHistory.deleteMany({});
  await prisma.registerConfig.deleteMany({});
  await prisma.user.deleteMany({});

  console.log('Cleared existing data');

  // Create users with hashed passwords
  const users = await Promise.all([
    prisma.user.create({
      data: {
        username: 'admin',
        password: await bcrypt.hash('admin123', 10),
      },
    }),
    prisma.user.create({
      data: {
        username: 'user1',
        password: await bcrypt.hash('password123', 10),
      },
    }),
    prisma.user.create({
      data: {
        username: 'user2',
        password: await bcrypt.hash('password123', 10),
      },
    }),
  ]);

  console.log(`Created ${users.length} users`);

  // Create SIP registration configs for each user
  const registerConfigs = await Promise.all([
    prisma.registerConfig.create({
      data: {
        userId: users[0].id,
        sipServer: 'wss://sip-server.example.com',
        sipUsername: 'admin',
        sipPassword: 'admin-sip-password',
        sipDomain: 'example.com',
        sipPort: 5060,
        useWebSocket: true,
      },
    }),
    prisma.registerConfig.create({
      data: {
        userId: users[1].id,
        sipServer: 'wss://sip-server.example.com',
        sipUsername: 'user1',
        sipPassword: 'user1-sip-password',
        sipDomain: 'example.com',
        sipPort: 5060,
        useWebSocket: true,
      },
    }),
    prisma.registerConfig.create({
      data: {
        userId: users[2].id,
        sipServer: 'wss://sip-server.example.com',
        sipUsername: 'user2',
        sipPassword: 'user2-sip-password',
        sipDomain: 'example.com',
        sipPort: 5061,
        useWebSocket: false,
      },
    }),
  ]);

  console.log(`Created ${registerConfigs.length} SIP registration configs`);

  // Create call history records
  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
  const threeHoursAgo = new Date(now.getTime() - 3 * 60 * 60 * 1000);

  const callHistories = await Promise.all([
    // Admin's call history
    prisma.callHistory.create({
      data: {
        userId: users[0].id,
        startTime: threeHoursAgo,
        endTime: new Date(threeHoursAgo.getTime() + 5 * 60 * 1000), // 5 minutes call
        direction: 'outgoing',
        phoneExt: '1001',
        notes: 'Business call with client',
      },
    }),
    prisma.callHistory.create({
      data: {
        userId: users[0].id,
        startTime: oneHourAgo,
        endTime: new Date(oneHourAgo.getTime() + 10 * 60 * 1000), // 10 minutes call
        direction: 'incoming',
        phoneExt: '2001',
        notes: 'Support call',
      },
    }),
    
    // User1's call history
    prisma.callHistory.create({
      data: {
        userId: users[1].id,
        startTime: twoHoursAgo,
        endTime: new Date(twoHoursAgo.getTime() + 15 * 60 * 1000), // 15 minutes call
        direction: 'outgoing',
        phoneExt: '3001',
        notes: 'Team meeting',
      },
    }),
    prisma.callHistory.create({
      data: {
        userId: users[1].id,
        startTime: oneHourAgo,
        endTime: new Date(oneHourAgo.getTime() + 3 * 60 * 1000), // 3 minutes call
        direction: 'incoming',
        phoneExt: '4001',
        notes: 'Quick question from colleague',
      },
    }),
    
    // User2's call history
    prisma.callHistory.create({
      data: {
        userId: users[2].id,
        startTime: twoHoursAgo,
        endTime: new Date(twoHoursAgo.getTime() + 8 * 60 * 1000), // 8 minutes call
        direction: 'outgoing',
        phoneExt: '5001',
        notes: 'Sales call',
      },
    }),
    prisma.callHistory.create({
      data: {
        userId: users[2].id,
        startTime: now,
        endTime: null, // Ongoing call
        direction: 'incoming',
        phoneExt: '6001',
        notes: 'Ongoing support call',
      },
    }),
  ]);

  console.log(`Created ${callHistories.length} call history records`);
  console.log('Seed completed successfully!');
}

main()
  .catch((e) => {
    console.error('Error during seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
