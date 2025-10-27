import { useQuery } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import {
  BookOpen,
  Clock,
  Award,
  PlayCircle,
  CheckCircle,
  Lock,
  ChevronLeft,
  Users,
  TrendingUp,
} from "lucide-react";

interface Lesson {
  id: string;
  title: string;
  slug: string;
  description: string;
  order: number;
  estimatedDuration: number;
  videoUrl: string | null;
  prerequisiteLessonIds: string[];
}

interface Course {
  id: string;
  title: string;
  description: string;
  thumbnail: string;
  category: string;
  difficulty: string;
  estimatedDuration: number;
}

interface UserProgress {
  completionPercentage: number;
  enrolledAt: Date;
  isCompleted: boolean;
}

export default function CourseDetailPage() {
  const [, params] = useRoute("/learning/courses/:slug");
  const slug = params?.slug;
  const userId = localStorage.getItem("userId");

  const { data, isLoading } = useQuery<{
    course: Course;
    lessons: Lesson[];
    userProgress: UserProgress | null;
    lessonProgress: any[];
  }>({
    queryKey: ["/api/learning/courses", slug, userId],
    queryFn: async () => {
      const url = userId 
        ? `/api/learning/courses/${slug}?userId=${userId}`
        : `/api/learning/courses/${slug}`;
      const response = await fetch(url, { credentials: "include" });
      if (!response.ok) throw new Error("Failed to fetch course");
      return response.json();
    },
    enabled: !!slug,
  });

  if (isLoading) {
    return (
      <div className="flex-1 overflow-auto">
        <div className="p-8 animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-64" />
          <div className="h-48 bg-muted rounded" />
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-20 bg-muted rounded" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex-1 overflow-auto p-8">
        <Card>
          <CardContent className="p-12 text-center">
            <BookOpen className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">Course not found</h3>
            <Link href="/learning">
              <Button variant="outline" className="mt-4">
                <ChevronLeft className="h-4 w-4 mr-2" />
                Back to Learning Center
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { course, lessons, userProgress, lessonProgress } = data;
  const sortedLessons = [...lessons].sort((a, b) => a.order - b.order);
  const completedLessons = lessonProgress.filter((p) => p?.isCompleted).length;
  const totalLessons = lessons.length;
  const progress = userProgress?.completionPercentage || 0;

  return (
    <div className="flex-1 overflow-auto" data-testid="page-course-detail">
      <div className="relative h-64 bg-gradient-to-br from-primary/20 to-primary/5">
        {course.thumbnail && (
          <div
            className="absolute inset-0 opacity-20 bg-cover bg-center"
            style={{ backgroundImage: `url(${course.thumbnail})` }}
          />
        )}
        <div className="relative h-full p-8 flex flex-col justify-end">
          <Link href="/learning">
            <Button
              variant="ghost"
              size="sm"
              className="mb-4 w-fit"
              data-testid="button-back-to-learning"
            >
              <ChevronLeft className="h-4 w-4 mr-2" />
              Back to Learning Center
            </Button>
          </Link>
          
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Badge variant="secondary" data-testid="badge-category">
                {course.category}
              </Badge>
              <Badge variant="outline" data-testid="badge-difficulty">
                {course.difficulty}
              </Badge>
            </div>
            
            <h1 className="text-4xl font-bold" data-testid="text-course-title">
              {course.title}
            </h1>
            
            <div className="flex items-center gap-6 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <BookOpen className="h-4 w-4" />
                <span>{totalLessons} lessons</span>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4" />
                <span>{Math.round(course.estimatedDuration / 60)}h total</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="p-8 space-y-8">
        {userProgress && (
          <Card data-testid="card-progress">
            <CardHeader>
              <CardTitle>Your Progress</CardTitle>
              <CardDescription>
                {completedLessons} of {totalLessons} lessons completed
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <Progress value={progress} className="h-3" />
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">
                    {Math.round(progress)}% complete
                  </span>
                  {userProgress.isCompleted && (
                    <div className="flex items-center gap-1 text-green-600 dark:text-green-400">
                      <CheckCircle className="h-4 w-4" />
                      <span className="font-medium">Course Completed!</span>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>About This Course</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">{course.description}</p>
          </CardContent>
        </Card>

        <div>
          <h2 className="text-2xl font-bold mb-4">Course Content</h2>
          <div className="space-y-3">
            {sortedLessons.map((lesson, index) => {
              const lessonProg = lessonProgress[lessons.findIndex((l) => l.id === lesson.id)];
              const isCompleted = lessonProg?.isCompleted || false;
              const isLocked = lesson.prerequisiteLessonIds && lesson.prerequisiteLessonIds.length > 0 
                ? !lesson.prerequisiteLessonIds.every(prereqId => checkPrerequisite(prereqId, lessonProgress, lessons))
                : false;
              
              return (
                <LessonCard
                  key={lesson.id}
                  lesson={lesson}
                  index={index}
                  isCompleted={isCompleted}
                  isLocked={isLocked}
                />
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function checkPrerequisite(prerequisiteId: string, lessonProgress: any[], lessons: Lesson[]): boolean {
  const prereqIndex = lessons.findIndex((l) => l.id === prerequisiteId);
  if (prereqIndex === -1) return true;
  
  const progress = lessonProgress[prereqIndex];
  return progress?.isCompleted || false;
}

function LessonCard({
  lesson,
  index,
  isCompleted,
  isLocked,
}: {
  lesson: Lesson;
  index: number;
  isCompleted: boolean;
  isLocked: boolean;
}) {
  const content = (
    <Card
      className={`group ${isLocked ? "opacity-60" : "hover-elevate active-elevate-2 cursor-pointer"}`}
      data-testid={`card-lesson-${lesson.id}`}
    >
      <CardContent className="p-4">
        <div className="flex items-center gap-4">
          <div
            className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center font-semibold ${
              isCompleted
                ? "bg-green-500 text-white"
                : isLocked
                ? "bg-muted text-muted-foreground"
                : "bg-primary/10 text-primary"
            }`}
            data-testid={`badge-lesson-status-${lesson.id}`}
          >
            {isCompleted ? (
              <CheckCircle className="h-5 w-5" />
            ) : isLocked ? (
              <Lock className="h-5 w-5" />
            ) : (
              <span>{index + 1}</span>
            )}
          </div>

          <div className="flex-1 min-w-0">
            <h3 className="font-semibold line-clamp-1" data-testid={`text-lesson-title-${lesson.id}`}>
              {lesson.title}
            </h3>
            <p className="text-sm text-muted-foreground line-clamp-1">{lesson.description}</p>
          </div>

          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            {lesson.videoUrl && (
              <div className="flex items-center gap-1">
                <PlayCircle className="h-4 w-4" />
                <span>Video</span>
              </div>
            )}
            <div className="flex items-center gap-1">
              <Clock className="h-4 w-4" />
              <span>{lesson.estimatedDuration} min</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );

  if (isLocked) {
    return content;
  }

  return <Link href={`/learning/lessons/${lesson.slug}`}>{content}</Link>;
}
