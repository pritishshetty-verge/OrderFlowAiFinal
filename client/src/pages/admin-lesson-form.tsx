import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChevronLeft } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import { RichTextEditor } from "@/components/rich-text-editor";

const lessonFormSchema = z.object({
  title: z.string().min(3, "Title must be at least 3 characters"),
  slug: z.string().min(3, "Slug must be at least 3 characters").regex(/^[a-z0-9-]+$/, "Slug must be lowercase with hyphens only"),
  description: z.string().min(10, "Description must be at least 10 characters"),
  content: z.string().min(10, "Content must be at least 10 characters"),
  videoUrl: z.string().url("Must be a valid URL").optional().or(z.literal("")),
  courseId: z.string(),
  order: z.number().min(0),
  estimatedDuration: z.number().min(1, "Duration must be at least 1 minute"),
  prerequisiteLessonIds: z.array(z.string()).default([]),
});

type LessonFormValues = z.infer<typeof lessonFormSchema>;

export default function AdminLessonForm() {
  const [, params] = useRoute("/learning/admin/lessons/:id");
  const lessonId = params?.id === "new" ? null : params?.id;
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  
  // Get courseId from URL query params
  const urlParams = new URLSearchParams(window.location.search);
  const courseIdParam = urlParams.get("courseId");

  const [content, setContent] = useState("");

  const { data: lessonData, isLoading } = useQuery({
    queryKey: ["/api/learning/lessons", lessonId],
    queryFn: async () => {
      if (!lessonId) return null;
      const response = await fetch(`/api/learning/lessons/${lessonId}`, { credentials: "include" });
      if (!response.ok) throw new Error("Failed to fetch lesson");
      return response.json();
    },
    enabled: !!lessonId,
  });

  const { data: coursesData } = useQuery<{ courses: Array<{ id: string; title: string }> }>({
    queryKey: ["/api/learning/courses"],
    queryFn: async () => {
      const response = await fetch("/api/learning/courses", { credentials: "include" });
      if (!response.ok) throw new Error("Failed to fetch courses");
      return response.json();
    },
  });

  const form = useForm<LessonFormValues>({
    resolver: zodResolver(lessonFormSchema),
    defaultValues: {
      title: "",
      slug: "",
      description: "",
      content: "",
      videoUrl: "",
      courseId: courseIdParam || "",
      order: 0,
      estimatedDuration: 15,
      prerequisiteLessonIds: [],
    },
  });

  useEffect(() => {
    if (lessonData?.lesson) {
      form.reset({
        title: lessonData.lesson.title,
        slug: lessonData.lesson.slug,
        description: lessonData.lesson.description,
        content: lessonData.lesson.content,
        videoUrl: lessonData.lesson.videoUrl || "",
        courseId: lessonData.lesson.courseId,
        order: lessonData.lesson.order,
        estimatedDuration: lessonData.lesson.estimatedDuration,
        prerequisiteLessonIds: lessonData.lesson.prerequisiteLessonIds || [],
      });
      setContent(lessonData.lesson.content);
    }
  }, [lessonData, form]);

  const saveMutation = useMutation({
    mutationFn: async (data: LessonFormValues) => {
      if (lessonId) {
        return await apiRequest("PATCH", `/api/admin/learning/lessons/${lessonId}`, data);
      } else {
        return await apiRequest("POST", "/api/admin/learning/lessons", data);
      }
    },
    onSuccess: (response: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/learning/courses"] });
      queryClient.invalidateQueries({ queryKey: ["/api/learning/lessons"] });
      toast({
        title: lessonId ? "Lesson updated" : "Lesson created",
        description: lessonId ? "Your changes have been saved." : "New lesson has been created successfully.",
      });
      setLocation(`/learning/admin/courses/${response.lesson?.courseId || form.getValues("courseId")}`);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to save lesson.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: LessonFormValues) => {
    saveMutation.mutate(data);
  };

  const generateSlug = (title: string) => {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .trim();
  };

  if (isLoading && lessonId) {
    return (
      <div className="flex-1 overflow-auto p-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-64" />
          <div className="h-96 bg-muted rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto" data-testid="page-admin-lesson-form">
      <div className="p-8 space-y-6">
        <div className="flex items-center gap-4">
          <Link href="/learning/admin">
            <Button variant="ghost" size="icon" data-testid="button-back">
              <ChevronLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold" data-testid="text-page-title">
              {lessonId ? "Edit Lesson" : "Create New Lesson"}
            </h1>
            <p className="text-muted-foreground mt-2">
              {lessonId ? "Update lesson content and settings" : "Add a new lesson to your course"}
            </p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Lesson Details</CardTitle>
            <CardDescription>
              Fill in the information about your lesson
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <FormField
                  control={form.control}
                  name="courseId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Course</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-course">
                            <SelectValue placeholder="Select a course" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {coursesData?.courses.map((course) => (
                            <SelectItem key={course.id} value={course.id}>
                              {course.title}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="title"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Title</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="e.g., Introduction to Order Management"
                          {...field}
                          onChange={(e) => {
                            field.onChange(e);
                            if (!lessonId) {
                              form.setValue("slug", generateSlug(e.target.value));
                            }
                          }}
                          data-testid="input-title"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="slug"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>URL Slug</FormLabel>
                      <FormControl>
                        <Input placeholder="introduction-to-order-management" {...field} data-testid="input-slug" />
                      </FormControl>
                      <FormDescription>
                        URL-friendly identifier (lowercase, hyphens only)
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Brief summary of what this lesson covers..."
                          rows={3}
                          {...field}
                          data-testid="input-description"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="videoUrl"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Video URL (Optional)</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="https://www.youtube.com/watch?v=..."
                          {...field}
                          data-testid="input-video-url"
                        />
                      </FormControl>
                      <FormDescription>
                        YouTube or Vimeo URL for video content
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="content"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Lesson Content</FormLabel>
                      <FormControl>
                        <RichTextEditor
                          content={content}
                          onChange={(html) => {
                            setContent(html);
                            field.onChange(html);
                          }}
                          placeholder="Write your lesson content here..."
                        />
                      </FormControl>
                      <FormDescription>
                        Rich text content that will be displayed below the video
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-2 gap-6">
                  <FormField
                    control={form.control}
                    name="estimatedDuration"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Estimated Duration (minutes)</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            {...field}
                            onChange={(e) => field.onChange(parseInt(e.target.value))}
                            data-testid="input-duration"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="order"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Lesson Order</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            {...field}
                            onChange={(e) => field.onChange(parseInt(e.target.value))}
                            data-testid="input-order"
                          />
                        </FormControl>
                        <FormDescription>
                          Lower numbers appear first in the course
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="flex gap-4">
                  <Button type="submit" disabled={saveMutation.isPending} data-testid="button-save">
                    {saveMutation.isPending ? "Saving..." : lessonId ? "Update Lesson" : "Create Lesson"}
                  </Button>
                  <Link href="/learning/admin">
                    <Button type="button" variant="outline" data-testid="button-cancel">
                      Cancel
                    </Button>
                  </Link>
                </div>
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
