require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const os = require('os');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// 正確な現在のCPU使用率を計算するための関数（指定ミリ秒待機して差分を比較）
function getCpuUsageDelay(delayMs = 500) {
  return new Promise(resolve => {
    const startCpus = os.cpus();
    setTimeout(() => {
      const endCpus = os.cpus();
      let idle = 0, total = 0;
      for (let i = 0; i < startCpus.length; i++) {
        for (const type in startCpus[i].times) {
          total += endCpus[i].times[type] - startCpus[i].times[type];
        }
        idle += endCpus[i].times.idle - startCpus[i].times.idle;
      }
      const usage = total === 0 ? 0 : 100 - Math.round((100 * idle) / total);
      resolve(usage);
    }, delayMs);
  });
}

client.once('ready', async () => {
  console.log(`[Discord Bot] Logged in as ${client.user.tag}`);

  const channelId = process.env.DISCORD_CHANNEL_ID;
  if (!channelId) return;

  try {
    // キャッシュがない場合はfetchして取得する
    const channel = client.channels.cache.get(channelId) || await client.channels.fetch(channelId);
    if (!channel) return;

    const cpuPercent = await getCpuUsageDelay(500);
    const totalMem = (os.totalmem() / 1024 / 1024 / 1024).toFixed(2);
    const freeMem = (os.freemem() / 1024 / 1024 / 1024).toFixed(2);
    const usedMem = (totalMem - freeMem).toFixed(2);
    const memPercent = Math.round((usedMem / totalMem) * 100);

    const embed = new EmbedBuilder()
      .setTitle('Discord Bot が起動しました')
      .setColor(0x00AE86)
      .addFields(
        { name: 'Host', value: os.hostname(), inline: true },
        { name: 'CPU使用率', value: `${cpuPercent}%`, inline: true },
        { name: 'メモリ使用率', value: `${usedMem}GB / ${totalMem}GB (${memPercent}%)`, inline: false }
      )
      .setTimestamp();

    await channel.send({ embeds: [embed] });
    console.log('[Discord Bot] Startup message sent.');
  } catch (err) {
    console.error('[Discord Bot] Failed to send startup message:', err.message);
  }
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  if (message.content === '!status') {
    const cpuPercent = await getCpuUsageDelay(500);
    const uptime = (os.uptime() / 3600).toFixed(1);
    const totalMem = (os.totalmem() / 1024 / 1024 / 1024).toFixed(2);
    const freeMem = (os.freemem() / 1024 / 1024 / 1024).toFixed(2);
    const usedMem = (totalMem - freeMem).toFixed(2);
    const memPercent = Math.round((usedMem / totalMem) * 100);

    const embed = new EmbedBuilder()
      .setTitle('サーバー稼働ステータス')
      .setColor(0x00AE86)
      .addFields(
        { name: 'Host', value: os.hostname(), inline: true },
        { name: 'Uptime', value: `${uptime} hours`, inline: true },
        { name: 'CPU使用率', value: `${cpuPercent}%`, inline: true },
        { name: 'メモリ使用率', value: `${usedMem}GB / ${totalMem}GB (${memPercent}%)`, inline: false }
      )
      .setTimestamp();

    try {
      await message.reply({ embeds: [embed] });
    } catch (err) {
      console.error('[Discord Bot] Reply failed:', err.message);
    }
  }
});

client.login(process.env.DISCORD_BOT_TOKEN).catch(err => {
  console.error('[Discord Bot] Login failed:', err.message);
});