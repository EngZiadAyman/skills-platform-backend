// ==========================================
// server.js - Backend API
// ==========================================
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Supabase Client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// ==========================================
// 🔐 Authentication Routes
// ==========================================

// تسجيل دخول
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (error) throw error;

    // جلب بيانات المستخدم
    const { data: userData } = await supabase
      .from('users')
      .select('*, schools(name)')
      .eq('email', email)
      .single();

    res.json({ 
      success: true, 
      user: userData,
      session: data.session 
    });
  } catch (error) {
    res.status(401).json({ success: false, error: error.message });
  }
});

// تسجيل حساب جديد
app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, full_name, role, school_code } = req.body;

    // البحث عن المدرسة
    const { data: school } = await supabase
      .from('schools')
      .select('id')
      .eq('code', school_code)
      .single();

    if (!school) {
      return res.status(404).json({ success: false, error: 'المدرسة غير موجودة' });
    }

    // إنشاء حساب في Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password
    });

    if (authError) throw authError;

    // إضافة المستخدم للجدول
    const { data: userData, error: userError } = await supabase
      .from('users')
      .insert({
        id: authData.user.id,
        school_id: school.id,
        email,
        full_name,
        role
      })
      .select()
      .single();

    if (userError) throw userError;

    res.json({ success: true, user: userData });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// ==========================================
// 📋 Tasks Routes (المهام)
// ==========================================

// جلب مهام الطالب
app.get('/api/student/:studentId/tasks', async (req, res) => {
  try {
    const { studentId } = req.params;

    const { data: user } = await supabase
      .from('users')
      .select('school_id')
      .eq('id', studentId)
      .single();

    const { data: tasks } = await supabase
      .from('tasks')
      .select(`
        *,
        users!tasks_teacher_id_fkey(full_name),
        submissions(id, status, submitted_at)
      `)
      .eq('school_id', user.school_id)
      .eq('status', 'active')
      .order('due_date', { ascending: true });

    res.json({ success: true, tasks });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// إنشاء مهمة جديدة (المعلم)
app.post('/api/tasks', async (req, res) => {
  try {
    const { teacher_id, title, description, questions, due_date } = req.body;

    const { data: teacher } = await supabase
      .from('users')
      .select('school_id')
      .eq('id', teacher_id)
      .single();

    const { data: task } = await supabase
      .from('tasks')
      .insert({
        teacher_id,
        school_id: teacher.school_id,
        title,
        description,
        questions,
        due_date
      })
      .select()
      .single();

    res.json({ success: true, task });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// إلغاء مهمة
app.patch('/api/tasks/:taskId/cancel', async (req, res) => {
  try {
    const { taskId } = req.params;

    const { data } = await supabase
      .from('tasks')
      .update({ status: 'cancelled' })
      .eq('id', taskId)
      .select()
      .single();

    res.json({ success: true, task: data });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// ==========================================
// 📝 Submissions Routes (حلول الطلاب)
// ==========================================

// رفع حل للمهمة
app.post('/api/submissions', async (req, res) => {
  try {
    const { task_id, student_id, content, files } = req.body;

    const { data: submission } = await supabase
      .from('submissions')
      .insert({
        task_id,
        student_id,
        content,
        files
      })
      .select()
      .single();

    res.json({ success: true, submission });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// ==========================================
// 📊 Performance Routes (الأداء)
// ==========================================

// جلب أداء الطالب الشامل
app.get('/api/student/:studentId/performance', async (req, res) => {
  try {
    const { studentId } = req.params;

    // جلب جميع التقييمات
    const { data: assessments } = await supabase
      .from('assessments')
      .select(`
        *,
        skill_assessments(
          score,
          skills(name_ar, name_en)
        ),
        submissions(
          tasks(title, created_at)
        )
      `)
      .eq('submissions.student_id', studentId);

    // حساب متوسط كل مهارة
    const skillsMap = {};
    assessments?.forEach(assessment => {
      assessment.skill_assessments?.forEach(sa => {
        const skillName = sa.skills.name_en;
        if (!skillsMap[skillName]) {
          skillsMap[skillName] = { total: 0, count: 0, name_ar: sa.skills.name_ar };
        }
        skillsMap[skillName].total += parseFloat(sa.score);
        skillsMap[skillName].count += 1;
      });
    });

    const skillsPerformance = Object.entries(skillsMap).map(([skill, data]) => ({
      skill,
      skill_ar: data.name_ar,
      average: (data.total / data.count).toFixed(2)
    }));

    res.json({ 
      success: true, 
      assessments,
      skillsPerformance
    });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// ==========================================
// 🏫 Schools Routes
// ==========================================

// إنشاء مدرسة جديدة
app.post('/api/schools', async (req, res) => {
  try {
    const { name, code } = req.body;

    const { data: school } = await supabase
      .from('schools')
      .insert({ name, code })
      .select()
      .single();

    res.json({ success: true, school });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// ==========================================
// 🤖 AI Routes (الذكاء الاصطناعي)
// ==========================================
const aiService = require('./aiService');

// تحليل أداء الطالب بالذكاء الاصطناعي
app.post('/api/ai/analyze-performance', async (req, res) => {
  try {
    const { studentId } = req.body;

    // جلب بيانات الطالب
    const { data: submissions } = await supabase
      .from('submissions')
      .select(`
        *,
        assessments(
          skill_assessments(
            score,
            skills(name_en)
          )
        )
      `)
      .eq('student_id', studentId);

    // حساب المهارات الضعيفة
    const skillsMap = {};
    submissions?.forEach(sub => {
      sub.assessments?.forEach(assessment => {
        assessment.skill_assessments?.forEach(sa => {
          const skill = sa.skills.name_en;
          if (!skillsMap[skill]) skillsMap[skill] = [];
          skillsMap[skill].push(parseFloat(sa.score));
        });
      });
    });

    const skillScores = {};
    const weakSkills = [];
    Object.entries(skillsMap).forEach(([skill, scores]) => {
      const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
      skillScores[skill] = avg.toFixed(2);
      if (avg < 75) weakSkills.push(skill);
    });

    // تحليل بالذكاء الاصطناعي
    const analysis = await aiService.analyzeStudentPerformance({
      submissions,
      skillScores,
      weakSkills
    });

    res.json({ success: true, analysis });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// توليد توصيات ذكية
app.post('/api/ai/recommendations', async (req, res) => {
  try {
    const { studentId, skillName } = req.body;

    // جلب تاريخ الطالب في هذه المهارة
    const { data } = await supabase
      .from('skill_assessments')
      .select(`
        score,
        assessments(
          submissions(
            tasks(title)
          )
        )
      `)
      .eq('skills.name_en', skillName);

    const studentHistory = data?.map(item => ({
      taskTitle: item.assessments.submissions.tasks.title,
      score: item.score
    })) || [];

    const currentLevel = studentHistory.length > 0
      ? studentHistory.reduce((sum, h) => sum + parseFloat(h.score), 0) / studentHistory.length
      : 0;

    // توليد التوصيات
    const recommendations = await aiService.generateRecommendations(
      skillName,
      currentLevel,
      studentHistory
    );

    // حفظ التوصيات في قاعدة البيانات
    await supabase.from('recommendations').insert({
      student_id: studentId,
      skill_id: skillName,
      recommendation_text: recommendations.diagnosis,
      resources: recommendations.resources,
      priority: currentLevel < 60 ? 'high' : currentLevel < 75 ? 'medium' : 'low'
    });

    res.json({ success: true, recommendations });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// تقييم تلقائي لحل الطالب
app.post('/api/ai/grade-submission', async (req, res) => {
  try {
    const { submissionId } = req.body;

    // جلب بيانات الحل والمهمة
    const { data: submission } = await supabase
      .from('submissions')
      .select(`
        *,
        tasks(*)
      `)
      .eq('id', submissionId)
      .single();

    // تقييم بالذكاء الاصطناعي
    const grading = await aiService.autoGradeSubmission(
      submission.tasks,
      submission
    );

    // حفظ التقييم
    const { data: assessment } = await supabase
      .from('assessments')
      .insert({
        submission_id: submissionId,
        overall_score: grading.overallScore,
        feedback: grading.feedback,
        ai_analysis: grading
      })
      .select()
      .single();

    // حفظ درجات المهارات
    const skillAssessments = Object.entries(grading.skillScores).map(([skill, score]) => ({
      assessment_id: assessment.id,
      skill_id: skill,
      score
    }));

    await supabase.from('skill_assessments').insert(skillAssessments);

    res.json({ success: true, grading });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// ==========================================
// Server Start
// ==========================================
app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
});