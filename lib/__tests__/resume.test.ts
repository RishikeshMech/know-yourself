import test from 'node:test'
import assert from 'node:assert/strict'
import { analyzeResumeText } from '../resume.ts'

test('resume: evaluates a weak resume with brutal and honest low score', async () => {
  const weakResume = `
    John Doe
    Email: john@example.com | Phone: 9876543210
    Objective: Hardworking and enthusiastic student looking for an entry-level developer opportunity.
    Education: B.Tech Computer Science (2020 - 2024)
    Skills: HTML, CSS, JavaScript, React
    Projects:
    - Web Application: Worked on a frontend web application using React. Handled various assigned development tasks and bug fixes.
    - College Portal: Assisted with maintaining the website portal.
  `

  const result = await analyzeResumeText(weakResume, { full_name: 'John Doe' })
  assert.ok(result.resume_score <= 55, `Expected score <= 55 for weak resume without metrics, got ${result.resume_score}`)
  assert.ok(result.feedback.gaps.some(g => g.toLowerCase().includes('metric') || g.toLowerCase().includes('quantified') || g.toLowerCase().includes('github')))
  assert.equal(result.name_match, true)
})

test('resume: catches name mismatch and heavily penalizes score', async () => {
  const wrongResume = `
    Alice Wonderland
    alice@example.com | 9876543210
    Education: B.Tech
    Projects: Built an e-commerce platform using Node and React with 500 users.
  `

  const result = await analyzeResumeText(wrongResume, { full_name: 'Bob Builder' })
  assert.equal(result.name_match, false)
  assert.ok(result.resume_score <= 30, `Expected score <= 30 for mismatched name, got ${result.resume_score}`)
  assert.ok(result.flags.some(f => f.level === 'error' && f.text.toLowerCase().includes('mismatch')))
})

test('resume: awards higher score for quantified engineering impact and links', async () => {
  const strongResume = `
    Jane Smith
    jane@example.com | +91 9876543210 | github.com/janesmith | linkedin.com/in/janesmith
    Education: B.Tech Computer Science, GPA: 9.2 from National Institute of Technology (2020 - 2024)
    Skills: Python, TypeScript, React, Node.js, PostgreSQL, Docker, AWS, Redis, Express, GraphQL
    Experience:
    Software Engineering Intern — TechCorp Solutions (2023 - 2024)
    - Designed and implemented asynchronous microservices reducing API latency by 42% for 50k daily active users.
    - Automated CI/CD deployment pipelines using Docker and GitHub Actions, cutting release cycles from 3 hours to 15 minutes.
    Projects:
    Distributed Rate Limiter:
    - Built an in-memory sliding-window rate limiter in Node.js handling 10k requests per second with Redis cache and zero downtime.
    - Deployed production service on AWS ECS with monitoring alerts triggering at 70% connection pool saturation.
  `

  const result = await analyzeResumeText(strongResume, { full_name: 'Jane Smith' })
  assert.ok(result.resume_score >= 70, `Expected score >= 70 for strong quantified resume, got ${result.resume_score}`)
  assert.ok(result.feedback.strengths.length > 0)
})
