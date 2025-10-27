import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, Link, useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useEffect, useState, useRef } from "react";
import {
  ChevronLeft,
  ChevronRight,
  CheckCircle,
  Clock,
  Bookmark,
  PlayCircle,
  Award,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Lesson {
  id: string;
  title: string;
  slug: string;
  description: string;
  content: string;
  videoUrl: string | null;
  estimatedMinutes: number;
  orderIndex: number;
  courseId: string;
  contentType: string;
  prerequisiteLessonId: string | null;
}

interface Course {
  id: string;
  title: string;
  slug: string;
}

interface UserProgress {
  completionPercentage: number;
  timeSpent: number;
  videoProgress: number;
  isCompleted: boolean;
  isBookmarked: boolean;
}

export default function LessonPage() {
  const [, params] = useRoute("/learning/lessons/:slug");
  const slug = params?.slug;
  const userId = localStorage.getItem("userId");
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const [timeSpent, setTimeSpent] = useState(0);
  const startTimeRef = useRef<number>(Date.now());

  const { data, isLoading } = useQuery<{
    lesson: Lesson;
    course: Course;
    userProgress: UserProgress | null;
  }>({
    queryKey: ["/api/learning/lessons", slug, userId],
    enabled: !!slug,
  });

  const progressMutation = useMutation({
    mutationFn: async (progressData: {
      completionPercentage?: number;
      timeSpent?: number;
      isCompleted?: boolean;
    }) => {
      return await apiRequest(`/api/learning/lessons/${data?.lesson.id}/progress`, "POST", {
        userId,
        ...progressData,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/learning/lessons", slug] });
    },
  });

  const bookmarkMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest(`/api/learning/lessons/${data?.lesson.id}/bookmark`, "POST", {
        userId,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/learning/lessons", slug] });
      toast({
        title: data?.userProgress?.isBookmarked ? "Bookmark removed" : "Lesson bookmarked",
      });
    },
  });

  useEffect(() => {
    if (!data?.lesson) return;

    startTimeRef.current = Date.now();
    
    const interval = setInterval(() => {
      const elapsedSeconds = Math.floor((Date.now() - startTimeRef.current) / 1000);
      setTimeSpent((prev) => prev + 10);
      
      progressMutation.mutate({
        timeSpent: (data.userProgress?.timeSpent || 0) + elapsedSeconds,
      });
      
      startTimeRef.current = Date.now();
    }, 10000);

    return () => clearInterval(interval);
  }, [data?.lesson]);

  const handleMarkComplete = () => {
    progressMutation.mutate({
      completionPercentage: 100,
      isCompleted: true,
    });
    
    toast({
      title: "Lesson completed!",
      description: "Great job! Keep up the learning momentum.",
    });
  };

  if (isLoading) {
    return (
      <div className="flex-1 overflow-auto">
        <div className="p-8 animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-64" />
          <div className="h-96 bg-muted rounded" />
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex-1 overflow-auto p-8">
        <Card>
          <CardContent className="p-12 text-center">
            <h3 className="text-lg font-semibold mb-2">Lesson not found</h3>
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

  const { lesson, course, userProgress } = data;
  const isCompleted = userProgress?.isCompleted || false;
  const isBookmarked = userProgress?.isBookmarked || false;

  return (
    <div className="flex-1 overflow-auto" data-testid="page-lesson">
      <div className="border-b bg-background sticky top-0 z-10">
        <div className="p-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href={`/learning/courses/${course.slug}`}>
              <Button variant="ghost" size="sm" data-testid="button-back-to-course">
                <ChevronLeft className="h-4 w-4 mr-2" />
                Back to Course
              </Button>
            </Link>
            <Separator orientation="vertical" className="h-6" />
            <div>
              <div className="text-sm text-muted-foreground">{course.title}</div>
              <h2 className="font-semibold" data-testid="text-lesson-title">
                {lesson.title}
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => bookmarkMutation.mutate()}
              data-testid="button-bookmark"
            >
              <Bookmark
                className={`h-5 w-5 ${isBookmarked ? "fill-current text-yellow-500" : ""}`}
              />
            </Button>
            
            {!isCompleted && (
              <Button
                onClick={handleMarkComplete}
                disabled={progressMutation.isPending}
                data-testid="button-mark-complete"
              >
                <CheckCircle className="h-4 w-4 mr-2" />
                Mark Complete
              </Button>
            )}
            
            {isCompleted && (
              <Badge variant="default" className="bg-green-500 gap-2">
                <CheckCircle className="h-4 w-4" />
                Completed
              </Badge>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto p-8 space-y-8">
        {lesson.videoUrl && (
          <Card data-testid="card-video">
            <CardContent className="p-0">
              <div className="aspect-video bg-black rounded-lg overflow-hidden">
                <iframe
                  src={lesson.videoUrl}
                  className="w-full h-full"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  data-testid="video-player"
                />
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-6 text-sm text-muted-foreground mb-6">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4" />
                <span>{lesson.estimatedMinutes} min</span>
              </div>
              <div className="flex items-center gap-2">
                <PlayCircle className="h-4 w-4" />
                <span>{lesson.contentType}</span>
              </div>
            </div>

            <Separator className="mb-6" />

            <div className="prose dark:prose-invert max-w-none">
              <h1>{lesson.title}</h1>
              <p className="lead text-muted-foreground">{lesson.description}</p>
              
              <div dangerouslySetInnerHTML={{ __html: lesson.content }} />
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-between items-center pt-4">
          <Button variant="outline" disabled data-testid="button-previous">
            <ChevronLeft className="h-4 w-4 mr-2" />
            Previous Lesson
          </Button>
          
          <Button variant="outline" disabled data-testid="button-next">
            Next Lesson
            <ChevronRight className="h-4 w-4 ml-2" />
          </Button>
        </div>
      </div>
    </div>
  );
}
