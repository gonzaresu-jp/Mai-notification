// milestone-scheduler.js
// 記念日通知を自動送信するスケジューラー

const sqlite3 = require('sqlite3').verbose();
const webpush = require('web-push');
const path = require('path');

class MilestoneScheduler {
  constructor(dbPath, vapidConfig) {
    this.db = new sqlite3.Database(dbPath);
    this.vapidConfig = vapidConfig;
    this.checkInterval = 60 * 1000; // 1分ごとにチェック
    this.lastCheckedDate = null;
    
    // 記念日の定義
    this.DEBUT_DATE = new Date(2021, 2, 21); // 2021年3月21日
    this.BIRTHDAY = { month: 0, day: 7 }; // 1月7日（月は0-indexなので11）
    this.ANNIVERSARY = { month: 2, day: 21 }; // 3月21日
    
    // 通知済みマイルストーンを記録（重複防止）
    this.sentMilestones = new Set();
    this.loadSentMilestones();
  }

  // 既に送信済みのマイルストーンを読み込み
  loadSentMilestones() {
    const today = this.getTodayString();
    this.db.all(
      `SELECT title FROM notifications 
       WHERE platform = 'milestone' 
       AND DATE(created_at) = ?`,
      [today],
      (err, rows) => {
        if (err) {
          console.error('マイルストーン履歴読み込みエラー:', err);
          return;
        }
        rows.forEach(row => {
          this.sentMilestones.add(row.title);
        });
        console.log(`📅 本日送信済みマイルストーン: ${this.sentMilestones.size}件`);
      }
    );
  }

  getTodayString() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  }

  // 日付を0時0分0秒にリセット
  stripTime(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
  }

  // デビューからの日数を計算
  getDaysSinceDebut() {
    const now = this.stripTime(new Date());
    const debut = this.stripTime(this.DEBUT_DATE);
    return Math.floor((now.getTime() - debut.getTime()) / (24 * 60 * 60 * 1000));
  }

  // 今日が誕生日かチェック
  isBirthday() {
    const now = new Date();
    return now.getMonth() === this.BIRTHDAY.month && now.getDate() === this.BIRTHDAY.day;
  }

  // 今日が周年記念日かチェック
  isAnniversary() {
    const now = new Date();
    return now.getMonth() === this.ANNIVERSARY.month && now.getDate() === this.ANNIVERSARY.day;
  }

  // 周年数を計算
  getAnniversaryYear() {
    const now = new Date();
    const debutYear = this.DEBUT_DATE.getFullYear();
    return now.getFullYear() - debutYear;
  }

  // 特別な日数のマイルストーン（100日ごと、1000日、2000日など）
  getDebutMilestones(days) {
    const milestones = [];
    
    // 1000日ごと
    if (days > 0 && (days % 1000 === 0 || days === 1717)) {
      milestones.push({
        type: 'debut_days',
        days: days,
        title: `🎉 デビュー${days}日記念！`,
        body: `まいちゃんがデビューしてから${days}日が経ちました！`
      });
    }

    return milestones;
  }

  // 通知を送信
  async sendMilestoneNotification(milestone) {
    // 重複チェック
    if (this.sentMilestones.has(milestone.title)) {
      console.log(`⏭️  スキップ（送信済み）: ${milestone.title}`);
      return;
    }

    const payload = {
      title: milestone.title,
      body: milestone.body,
      url: './',
      icon: './icon.ico'
    };

    // 履歴に保存
    this.db.run(
      'INSERT INTO notifications (title, body, url, icon, platform, status) VALUES (?, ?, ?, ?, ?, ?)',
      [payload.title, payload.body, payload.url, payload.icon, 'milestone', 'success'],
      (err) => {
        if (err) {
          console.error('マイルストーン履歴保存エラー:', err);
        }
      }
    );

    // 全購読者に送信
    this.db.all(
      'SELECT client_id, subscription_json, settings_json FROM subscriptions',
      [],
      async (err, rows) => {
        if (err) {
          console.error('購読者取得エラー:', err);
          return;
        }

        let sentCount = 0;
        for (const row of rows) {
          try {
            const subscription = JSON.parse(row.subscription_json);
            const settings = row.settings_json ? JSON.parse(row.settings_json) : {};

            // milestone 通知の設定（デフォルトはON）
            if (settings.milestone === false) {
              continue;
            }

            const sent = await this.sendPushNotification(subscription, payload);
            if (sent) sentCount++;
          } catch (e) {
            console.error(`送信エラー (client: ${row.client_id}):`, e.message);
          }
        }

        console.log(`✅ ${milestone.title}: ${sentCount}/${rows.length}人に送信完了`);
        this.sentMilestones.add(milestone.title);
      }
    );
  }

  // Push通知を送信
  async sendPushNotification(subscription, payload) {
    try {
      await webpush.sendNotification(subscription, JSON.stringify(payload));
      return true;
    } catch (err) {
      if (err && (err.statusCode === 410 || err.statusCode === 404)) {
        // 無効な購読を削除
        this.db.run('DELETE FROM subscriptions WHERE endpoint = ?', [subscription.endpoint]);
      }
      return false;
    }
  }

  // 定期チェック実行
  async checkMilestones() {
    const today = this.getTodayString();
    
    // 日付が変わったらリセット
    if (this.lastCheckedDate !== today) {
      console.log(`📅 日付変更: ${this.lastCheckedDate} → ${today}`);
      this.sentMilestones.clear();
      this.loadSentMilestones();
      this.lastCheckedDate = today;
    }

    const milestones = [];

    // 1. 誕生日チェック
    if (this.isBirthday()) {
      const now = new Date();
      milestones.push({
        type: 'birthday',
        title: '🎂 お誕生日おめでとう！',
        body: `まいちゃんにお祝いしてあげましょう！🎉`
      });
    }

    // 2. 周年記念チェック
    if (this.isAnniversary()) {
      const year = this.getAnniversaryYear();
      milestones.push({
        type: 'anniversary',
        title: `🎊 ${year}周年おめでとう！`,
        body: `まいちゃんデビュー${year}周年記念日です！いつもありがとう！`
      });
    }

    // 3. デビューからの日数マイルストーン
    const daysSinceDebut = this.getDaysSinceDebut();
    const debutMilestones = this.getDebutMilestones(daysSinceDebut);
    milestones.push(...debutMilestones);

    // 通知送信
    for (const milestone of milestones) {
      await this.sendMilestoneNotification(milestone);
    }
  }

  // スケジューラー開始
  start() {
    console.log('🚀 マイルストーン通知スケジューラー起動');
    this.lastCheckedDate = this.getTodayString();
    
    // 起動時に即座にチェック
    this.checkMilestones();
    
    // 定期実行
    setInterval(() => {
      this.checkMilestones();
    }, this.checkInterval);
  }

  // スケジューラー停止
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      console.log('⏹️  マイルストーン通知スケジューラー停止');
    }
  }
}

module.exports = MilestoneScheduler;
