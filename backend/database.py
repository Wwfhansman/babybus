import sqlite3
import json
from datetime import datetime
import os


class DatabaseManager:
    def __init__(self, db_path="comics_system.db"):
        self.db_path = db_path
        self.init_database()

    def init_database(self):
        """初始化数据库表"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        # 用户表
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                email TEXT UNIQUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_login TIMESTAMP
            )
        ''')

        # 漫画历史记录表
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS comics_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                process_id TEXT UNIQUE NOT NULL,
                novel_text TEXT NOT NULL,
                llm_result TEXT NOT NULL,
                comic_results TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                title TEXT,
                description TEXT,
                FOREIGN KEY (user_id) REFERENCES users (id)
            )
        ''')

        # 用户会话表（用于记住登录状态）
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS user_sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                session_token TEXT UNIQUE NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                expires_at TIMESTAMP NOT NULL,
                FOREIGN KEY (user_id) REFERENCES users (id)
            )
        ''')

        conn.commit()
        conn.close()

    def create_user(self, username, password_hash, email=None):
        """创建新用户"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        try:
            cursor.execute(
                "INSERT INTO users (username, password_hash, email) VALUES (?, ?, ?)",
                (username, password_hash, email)
            )
            user_id = cursor.lastrowid
            conn.commit()
            return user_id
        except sqlite3.IntegrityError:
            return None  # 用户名或邮箱已存在
        finally:
            conn.close()

    def get_user_by_username(self, username):
        """根据用户名获取用户"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM users WHERE username = ?", (username,))
        user = cursor.fetchone()
        conn.close()

        if user:
            return {
                'id': user[0],
                'username': user[1],
                'password_hash': user[2],
                'email': user[3],
                'created_at': user[4],
                'last_login': user[5]
            }
        return None

    def get_user_by_id(self, user_id):
        """根据用户ID获取用户"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM users WHERE id = ?", (user_id,))
        user = cursor.fetchone()
        conn.close()

        if user:
            return {
                'id': user[0],
                'username': user[1],
                'password_hash': user[2],
                'email': user[3],
                'created_at': user[4],
                'last_login': user[5]
            }
        return None

    def update_user_login_time(self, user_id):
        """更新用户最后登录时间"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        cursor.execute(
            "UPDATE users SET last_login = ? WHERE id = ?",
            (datetime.now(), user_id)
        )
        conn.commit()
        conn.close()

    def save_comics_history(self, user_id, process_id, novel_text, llm_result, comic_results, title=None,
                            description=None):
        """保存漫画生成历史记录"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        try:
            cursor.execute('''
                INSERT INTO comics_history 
                (user_id, process_id, novel_text, llm_result, comic_results, title, description)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            ''', (
                user_id,
                process_id,
                novel_text,
                json.dumps(llm_result, ensure_ascii=False),
                json.dumps(comic_results, ensure_ascii=False),
                title,
                description
            ))
            conn.commit()
            return True
        except sqlite3.IntegrityError:
            return False  # process_id 已存在
        finally:
            conn.close()

    def get_user_comics_history(self, user_id, limit=50, offset=0):
        """获取用户的漫画历史记录"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        cursor.execute('''
            SELECT id, process_id, novel_text, llm_result, comic_results, created_at, title, description
            FROM comics_history 
            WHERE user_id = ? 
            ORDER BY created_at DESC 
            LIMIT ? OFFSET ?
        ''', (user_id, limit, offset))

        history = []
        for row in cursor.fetchall():
            try:
                llm_result = json.loads(row[3]) if row[3] else {}
                comic_results = json.loads(row[4]) if row[4] else []

                history.append({
                    'id': row[0],
                    'process_id': row[1],
                    'novel_text': row[2],
                    'llm_result': llm_result,
                    'comic_results': comic_results,
                    'created_at': row[5],
                    'title': row[6],
                    'description': row[7]
                })
            except json.JSONDecodeError:
                continue  # 跳过格式错误的数据

        conn.close()
        return history

    def get_comics_by_process_id(self, process_id):
        """根据处理ID获取漫画记录"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        cursor.execute('''
            SELECT * FROM comics_history WHERE process_id = ?
        ''', (process_id,))

        row = cursor.fetchone()
        conn.close()

        if row:
            try:
                llm_result = json.loads(row[4]) if row[4] else {}
                comic_results = json.loads(row[5]) if row[5] else []

                return {
                    'id': row[0],
                    'user_id': row[1],
                    'process_id': row[2],
                    'novel_text': row[3],
                    'llm_result': llm_result,
                    'comic_results': comic_results,
                    'created_at': row[6],
                    'title': row[7],
                    'description': row[8]
                }
            except json.JSONDecodeError:
                return None
        return None

    def delete_comics_history(self, user_id, history_id):
        """删除用户的漫画历史记录"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        cursor.execute('''
            DELETE FROM comics_history 
            WHERE id = ? AND user_id = ?
        ''', (history_id, user_id))

        deleted = cursor.rowcount > 0
        conn.commit()
        conn.close()
        return deleted

    def create_session(self, user_id, session_token, expires_hours=24):
        """创建用户会话"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        expires_at = datetime.now().timestamp() + (expires_hours * 3600)

        cursor.execute('''
            INSERT INTO user_sessions (user_id, session_token, expires_at)
            VALUES (?, ?, ?)
        ''', (user_id, session_token, expires_at))

        conn.commit()
        conn.close()

    def get_session(self, session_token):
        """获取会话信息"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        cursor.execute('''
            SELECT us.*, u.username 
            FROM user_sessions us 
            JOIN users u ON us.user_id = u.id 
            WHERE us.session_token = ? AND us.expires_at > ?
        ''', (session_token, datetime.now().timestamp()))

        session = cursor.fetchone()
        conn.close()

        if session:
            return {
                'session_id': session[0],
                'user_id': session[1],
                'session_token': session[2],
                'created_at': session[3],
                'expires_at': session[4],
                'username': session[5]
            }
        return None

    def delete_session(self, session_token):
        """删除会话"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        cursor.execute('''
            DELETE FROM user_sessions WHERE session_token = ?
        ''', (session_token,))

        conn.commit()
        conn.close()

    def cleanup_expired_sessions(self):
        """清理过期会话"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        cursor.execute('''
            DELETE FROM user_sessions WHERE expires_at <= ?
        ''', (datetime.now().timestamp(),))

        conn.commit()
        conn.close()